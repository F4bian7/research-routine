import { type Gemini, generateJson } from './gemini';

// Notes for the second brain, drafted from what the learner is reading.
export type SuggestedNote = { title: string; body: string };

export function parseSuggestions(text: string): SuggestedNote[] {
  const raw = JSON.parse(text) as { notes?: unknown[] } | unknown[];
  const list = Array.isArray(raw) ? raw : (raw.notes ?? []);
  const out = list
    .map((n) => n as { title?: unknown; body?: unknown })
    .map((n) => ({
      title: typeof n.title === 'string' ? n.title.trim() : '',
      body: typeof n.body === 'string' ? n.body.trim() : '',
    }))
    .filter((n) => n.title && n.body)
    .slice(0, 5);
  if (out.length === 0) throw new Error('no notes');
  return out;
}

export function suggestNotes(
  g: Gemini,
  source: { kind: string; title: string; text: string },
  context: { profile: string; existingTitles: string[] }
) {
  const instruction = `You help a learner build a second brain (a Zettelkasten): short, permanent
notes, one idea each, written in plain words as if by the learner, so they are useful
months later without the source.

From the item below, write 2 to 4 notes with the insights most worth keeping for this
learner. Each note:
- "title": the idea itself as a short statement, e.g. "Self-navigation gives 100% scan
  efficiency" (not a topic label like "Self-navigation");
- "body": 2 to 5 sentences: the idea, why it holds or how it works, a concrete detail or
  number from the source, and where it matters. Formulas in LaTeX between $ and $.
Where a note clearly relates to one of the existing notes listed, link it with
[[Exact existing title]] inside the body; never invent links to titles not in the list.
Do not repeat what an existing note already says.

About the learner:
${context.profile}

Existing notes:
${context.existingTitles.slice(0, 150).join('\n') || '(none yet)'}

Answer only with JSON: { "notes": [ { "title": "...", "body": "..." } ] }`;
  const input = `(${source.kind}) ${source.title}\n\n${source.text}`;
  return generateJson(g, instruction, input, parseSuggestions, 0.3);
}
