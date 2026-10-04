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
export type Gemini = { apiKey: string; model: string; onModel?: (model: string) => void };

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

// Errors that another model may not have: unknown model, or no (free) quota for it.
function tryAnotherModel(e: unknown) {
  if (!(e instanceof GeminiError)) return false;
  if (e.status === 404) return true;
  if (e.status === 429 && /limit: ?0\b|free.?tier|quota/i.test(e.message)) return true;
  if (e.status === 400 && /not (supported|found)|unsupported/i.test(e.message)) return true;
  return false;
}

// One JSON request to Gemini; `parse` turns the answer into the wanted shape. If the
// chosen model is not available to the key, other Flash models are tried and the one
// that works is remembered.
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
    try {
      return parse(extractJson(text));
    } catch {
      throw new GeminiError(`Gemini's answer could not be read: ${text.slice(0, 120)}`);
    }
  };
  try {
    return await run(gemini.model);
  } catch (e) {
    if (!tryAnotherModel(e)) throw e;
    const others = (await listModels(gemini.apiKey)).filter((m) => m !== gemini.model).slice(0, 4);
    for (const model of others) {
      try {
        const out = await run(model);
        gemini.onModel?.(model);
        return out;
      } catch (e2) {
        if (!tryAnotherModel(e2)) throw e2;
      }
    }
    throw e;
  }
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
    { ...g, onModel: (m) => { used = m; g.onModel?.(m); } },
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
