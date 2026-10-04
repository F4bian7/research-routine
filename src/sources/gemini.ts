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

type GenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string };
};

function parseSummary(text: string): Summary {
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  const raw = JSON.parse(json) as Partial<Summary>;
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

export async function summarize(
  apiKey: string,
  model: string,
  paper: { title: string; text: string }
): Promise<Summary> {
  const body = {
    systemInstruction: { parts: [{ text: INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `Title: ${paper.title}\n\n${paper.text.slice(0, MAX_CHARS)}` }],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  };
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GenerateResponse;
  if (!res.ok) {
    throw new GeminiError(data.error?.message ?? `HTTP ${res.status}`, res.status);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new GeminiError('Empty answer from Gemini.');
  try {
    return parseSummary(text);
  } catch {
    throw new GeminiError('Gemini did not return valid JSON.');
  }
}

// Cheap check that key and model work: fetches the model description, no generation.
export async function checkKey(apiKey: string, model: string): Promise<void> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as GenerateResponse;
    throw new GeminiError(data.error?.message ?? `HTTP ${res.status}`, res.status);
  }
}

// Short hint for the errors a user can fix.
export function explainError(e: unknown): string {
  if (e instanceof GeminiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return 'The API key is not valid.';
    if (e.status === 403) return 'The API key has no access. Check the key in the settings.';
    if (e.status === 404) return 'This model does not exist. Check the model name in the settings.';
    if (e.status === 429) return 'Free tier limit reached. Try again later.';
    return `Gemini: ${e.message}`;
  }
  return 'Could not reach Gemini. Are you online?';
}

export { parseSummary as _parseSummaryForTests };
