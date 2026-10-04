import type { Summary } from '@/db/types';

// Plain-language summaries via the Gemini API (free tier, key from Google AI Studio).
// Called straight from the device; the key never leaves it except in this request.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CHARS = 60_000; // keeps one request well inside free-tier token limits

const INSTRUCTION = `Du erklärst wissenschaftliche Paper aus der biomedizinischen Technik
(medizinische Bildanalyse, EEG, MRT) für eine Person mit technischem Studium, die das
Teilgebiet aber nicht im Detail kennt. Schreibe auf Deutsch, in einfacher, klarer Sprache,
kurze Sätze, keine Floskeln. Fachbegriffe, die man kennen sollte, kommen in "terms" und werden
dort in ein bis zwei Sätzen erklärt. Erfinde nichts: was nicht im Text steht, lässt du weg.

Antworte nur mit JSON in genau dieser Form:
{
  "short": "2 bis 3 Sätze: worum geht es und was ist das Ergebnis",
  "problem": "Welches Problem wird gelöst und warum ist es schwierig",
  "method": "Wie gehen die Autor:innen vor, ohne Formeln",
  "result": "Was kam heraus, mit den wichtigsten Zahlen",
  "relevance": "Warum ist das für das Feld wichtig",
  "limits": "Grenzen und offene Fragen",
  "terms": [{ "term": "Begriff", "explanation": "Erklärung" }]
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
        parts: [{ text: `Titel: ${paper.title}\n\n${paper.text.slice(0, MAX_CHARS)}` }],
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
  if (!text) throw new GeminiError('Leere Antwort von Gemini.');
  try {
    return parseSummary(text);
  } catch {
    throw new GeminiError('Gemini hat kein gültiges JSON geliefert.');
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

// Short German hint for the errors a user can fix.
export function explainError(e: unknown): string {
  if (e instanceof GeminiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return 'Der API-Key ist ungültig.';
    if (e.status === 403) return 'Der API-Key hat keinen Zugriff. Key in den Einstellungen prüfen.';
    if (e.status === 404) return 'Das Modell gibt es nicht. Modellname in den Einstellungen prüfen.';
    if (e.status === 429) return 'Tageslimit der Gratis-Stufe erreicht. Später nochmal versuchen.';
    return `Gemini: ${e.message}`;
  }
  return 'Keine Verbindung zu Gemini. Bist du online?';
}

export { parseSummary as _parseSummaryForTests };
