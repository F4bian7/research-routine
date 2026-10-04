import type { Summary } from '@/db/types';

// Plain-language summaries via the Gemini API (free tier, key from Google AI Studio).
// Called straight from the device; the key never leaves it except in this request.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CHARS = 60_000; // keeps one request well inside free-tier token limits

const INSTRUCTION = `You explain scientific papers from biomedical engineering (medical image
analysis, EEG, MRI) to a reader with an engineering degree who does not know the particular
subfield in depth. Write in English, in plain and clear language, short sentences, no filler.
Technical terms worth knowing go into "terms" with a one or two sentence explanation.
Do not invent anything: leave out what the text does not say.

Answer only with JSON of exactly this shape:
{
  "short": "2 to 3 sentences: what the paper is about and what it found",
  "problem": "Which problem is solved and why it is hard",
  "method": "How the authors approach it, without formulas",
  "result": "What came out, with the key numbers",
  "relevance": "Why it matters for the field",
  "limits": "Limitations and open questions",
  "terms": [{ "term": "term", "explanation": "explanation" }]
}`;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

// Key, model, and a callback that remembers a model found to work when the chosen
// one is not available (for example no free quota for it).
export type Gemini = {
  apiKey: string;
  model: string;
  fallbacks?: string[]; // tried in order when `model` has no quota left
  onModel?: (model: string) => void; // called when `model` is gone and another took over
  onUsed?: (model: string) => void; // called with the model that answered
};

type GenerateResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

function parseSummary(text: string): Summary {
  const raw = JSON.parse(text) as Partial<Summary>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    short: str(raw.short),
    problem: str(raw.problem),
    method: str(raw.method),
    result: str(raw.result),
    relevance: str(raw.relevance),
    limits: str(raw.limits),
    terms: Array.isArray(raw.terms)
      ? raw.terms
          .map((t) => ({ term: str(t?.term), explanation: str(t?.explanation) }))
          .filter((t) => t.term && t.explanation)
      : [],
  };
}

// The JSON inside a model answer, also when it comes in a code fence or with words around.
export function extractJson(text: string): string {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (/^[[{]/.test(t)) return t;
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}

async function callModel(apiKey: string, model: string, body: unknown): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GeminiError('Could not reach Gemini. Are you online?');
  }
  const data = (await res.json().catch(() => ({}))) as GenerateResponse;
  if (!res.ok) throw new GeminiError(data.error?.message ?? `HTTP ${res.status}`, res.status);
  const candidate = data.candidates?.[0];
  // Thinking models may send their thoughts as extra parts; only the answer counts.
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text) {
    const why = data.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no text';
    throw new GeminiError(`Gemini returned no answer (${why}).`);
  }
  return text;
}

// Models of the key that can generate text, newest Flash first, Flash-Lite after.
export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${ENDPOINT}?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-.*flash/.test(n) && !/(tts|image|audio|live|preview-\d{2}-\d{2}|exp)/.test(n))
    .sort((a, b) => {
      const lite = Number(a.includes('lite')) - Number(b.includes('lite'));
      return lite !== 0 ? lite : version(b) - version(a);
    });
}

// Why a model failed, and what that means for trying another one.
//  - 'gone': unknown model or never any free quota; switch for good.
//  - 'today': quota used up (per day or per minute); another model has its own quota.
function failureKind(e: unknown): 'gone' | 'today' | null {
  if (!(e instanceof GeminiError)) return null;
  if (e.status === 404) return 'gone';
  if (e.status === 400 && /not (supported|found)|unsupported/i.test(e.message)) return 'gone';
  if (e.status === 429) return /limit: ?0\b/.test(e.message) ? 'gone' : 'today';
  if (e.status === 503) return 'today'; // overloaded
  return null;
}

// Models that ran out today are skipped until the quota resets (midnight Pacific).
const exhausted = new Map<string, number>();
const EXHAUSTED_FOR_MS = 3 * 3600 * 1000;

function usable(model: string) {
  const until = exhausted.get(model);
  return !until || until < Date.now();
}

// Usage per model and day, for the counter in Settings.
const usageListeners = new Set<(model: string) => void>();
export function onGeminiUsage(listener: (model: string) => void) {
  usageListeners.add(listener);
  return () => usageListeners.delete(listener);
}

// One JSON request to Gemini; `parse` turns the answer into the wanted shape. When the
// model has no quota left, the fallbacks (and then other Flash models of the key) are
// tried; a model that is gone for good is replaced in Settings via `onModel`.
export async function generateJson<T>(
  gemini: Gemini,
  instruction: string,
  input: string,
  parse: (text: string) => T,
  temperature = 0.3
): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: 'user', parts: [{ text: input.slice(0, MAX_CHARS) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };
  const run = async (model: string) => {
    const text = await callModel(gemini.apiKey, model, body);
    usageListeners.forEach((l) => l(model));
    try {
      return parse(extractJson(text));
    } catch {
      throw new GeminiError(`Gemini's answer could not be read: ${text.slice(0, 120)}`);
    }
  };

  const tried = new Set<string>();
  let firstError: unknown = null;
  let listed = false;
  let chosenGone = false;
  const queue = [gemini.model, ...(gemini.fallbacks ?? [])];
  while (queue.length) {
    const model = queue.shift()!;
    if (tried.has(model)) continue;
    tried.add(model);
    // Skip a model that ran out earlier today, unless nothing else is left.
    if (!usable(model) && queue.length) continue;
    try {
      const out = await run(model);
      if (chosenGone && model !== gemini.model) gemini.onModel?.(model);
      gemini.onUsed?.(model);
      return out;
    } catch (e) {
      const kind = failureKind(e);
      if (!kind) throw e;
      firstError ??= e;
      if (kind === 'today') exhausted.set(model, Date.now() + EXHAUSTED_FOR_MS);
      if (kind === 'gone' && model === gemini.model) chosenGone = true;
      if (!queue.length && !listed) {
        listed = true;
        queue.push(...(await listModels(gemini.apiKey)).filter((m) => !tried.has(m)).slice(0, 4));
      }
    }
  }
  throw firstError;
}

export async function summarize(
  g: Gemini,
  paper: { title: string; text: string },
  goal?: string
): Promise<Summary> {
  const aim = goal?.trim()
    ? `\n\nThe reader is preparing for this: ${goal.trim()}\nIn "relevance", also say what the paper means for that aim.`
    : '';
  return generateJson(g, INSTRUCTION + aim, `Title: ${paper.title}\n\n${paper.text}`, parseSummary);
}

// A real, tiny request: proves key, model and quota. Returns the model that answered.
export async function testGemini(g: Gemini): Promise<string> {
  let used = g.model;
  await generateJson(
    { ...g, onUsed: (m) => (used = m) },
    'Answer only with JSON: {"ok": true}',
    'Say ok.',
    (t) => {
      if ((JSON.parse(t) as { ok?: unknown }).ok !== true) throw new Error('unexpected');
      return true;
    },
    0
  );
  return used;
}

// A short hint for what the user can do, with Google's own words when they help.
export function explainError(e: unknown): string {
  if (e instanceof GeminiError) {
    const google = e.message.length > 160 ? `${e.message.slice(0, 157)}…` : e.message;
    if (e.status === 400 && /api key/i.test(e.message)) return 'The API key is not valid. Copy it again from Google AI Studio.';
    if (e.status === 403) return `The API key has no access (${google}).`;
    if (e.status === 404) return `Model not found. Pick another one in Settings. (${google})`;
    if (e.status === 429) return `Gemini says the quota is used up. Try again in a minute, or tomorrow if it is the daily limit. (${google})`;
    if (e.status && e.status >= 500) return 'Gemini is busy or down right now. Try again in a minute.';
    return google;
  }
  return 'Could not reach Gemini. Are you online?';
}

export { parseSummary as _parseSummaryForTests };
