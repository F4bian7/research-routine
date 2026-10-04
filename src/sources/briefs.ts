import { type Gemini, generateJson } from './gemini';

// Plain-language briefs for feed items, with a rating of how interesting each one is
// for this particular reader. One request covers many items.

export type Brief = {
  score: number; // 1 (skip) to 5 (must read) for this reader
  gist: string; // what it is, in plain words
  why: string; // why it matters, for this reader if possible
  more?: string; // a longer explanation, written on request
};

export type BriefInput = { id: string; kind: string; text: string };

const INSTRUCTION = (profile: string) => `You help one reader keep up with research and tech news.
Many items are outside their field and full of jargon. For every item:
- "gist": what it is about, in plain words a curious engineering student understands, no
  unexplained jargon, at most 30 words.
- "why": why it matters. If it connects to the reader's interests below, say how; otherwise
  say why it matters in general. At most 25 words.
- "score": how worthwhile it is for this reader, 1 to 5. 5 = directly useful for their
  work or goals, or a genuinely major development anyone in science or tech should know;
  3 = interesting but optional; 1 = skip. Be strict: most items should be 2 or 3.

About the reader:
${profile}

Answer only with JSON: { "items": [ { "id": "...", "score": 3, "gist": "...", "why": "..." } ] }`;

export function parseBriefs(text: string, ids: string[]): Map<string, Brief> {
  const raw = JSON.parse(text) as { items?: unknown[] } | unknown[];
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  const out = new Map<string, Brief>();
  for (const r of list) {
    const o = (r ?? {}) as { id?: unknown; score?: unknown; gist?: unknown; why?: unknown };
    const id = String(o.id ?? '');
    if (!ids.includes(id)) continue;
    const score = Math.min(5, Math.max(1, Math.round(Number(o.score) || 3)));
    const gist = typeof o.gist === 'string' ? o.gist.trim() : '';
    if (!gist) continue;
    out.set(id, { score, gist, why: typeof o.why === 'string' ? o.why.trim() : '' });
  }
  if (out.size === 0) throw new Error('no briefs');
  return out;
}

export function writeBriefs(g: Gemini, profile: string, items: BriefInput[]) {
  const input = items.map((i) => `[id: ${i.id}] (${i.kind}) ${i.text.slice(0, 700)}`).join('\n\n');
  return generateJson(g, INSTRUCTION(profile), input, (t) => parseBriefs(t, items.map((i) => i.id)), 0.2);
}

export function explainMore(g: Gemini, profile: string, item: BriefInput) {
  const instruction = `Explain this item to a curious engineering student who is new to its field.
About 150 words: what problem it addresses, the key idea in plain words, and why people care.
Explain every technical term you use. Then, if it fits, one sentence on what it could mean
for this reader:
${profile}

Answer only with JSON: { "text": "..." }`;
  return generateJson(g, instruction, `(${item.kind}) ${item.text}`, (t) => {
    const r = JSON.parse(t) as { text?: unknown };
    if (typeof r.text !== 'string' || !r.text.trim()) throw new Error('empty');
    return r.text.trim();
  });
}
