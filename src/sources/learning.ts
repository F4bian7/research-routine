import type { Direction, LessonContent, Quiz } from '@/db/types';
import { type Gemini, generateJson } from './gemini';

// Gemini prompts for the Learn part: a fundamentals syllabus per topic, one lesson
// at a time, and flashcards drafted from papers and notes.

const AUDIENCE = `The learner studies biomedical engineering (medical image analysis with deep
learning, EEG, MRI) and wants to understand the field well enough to read current research.
Write in English, plainly, in short sentences.`;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// The app renders LaTeX; this keeps formulas in a form it can find.
const FORMULAS = `Write every formula in LaTeX: inline between $ and $, a formula on its own line
between $$ and $$. In the JSON, escape each backslash (write \\\\frac, not \\frac).`;

// The learner's own aim for a topic (for example a thesis), so explanations can point
// to where an idea will matter for them.
function goalLine(goal?: string) {
  return goal?.trim()
    ? `\nThe learner is preparing for this: ${goal.trim()}\nWhere it fits naturally, connect the content to that aim.`
    : '';
}

// ---- Syllabus ---------------------------------------------------------------

export type SyllabusItem = { title: string; outline: string };

// Models do not always keep to the requested shape: accept a bare list, other key
// names, and answers given as letters or as the option text.
function listIn(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = (raw ?? {}) as Record<string, unknown>;
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k] as unknown[];
  const firstList = Object.values(obj).find(Array.isArray);
  return (firstList as unknown[]) ?? [];
}

export function parseSyllabus(text: string): SyllabusItem[] {
  const items = listIn(JSON.parse(text), ['lessons', 'syllabus', 'items'])
    .map((l) => l as { title?: unknown; outline?: unknown })
    .map((l) => ({ title: str(l.title), outline: str(l.outline) }))
    .filter((l) => l.title);
  if (items.length === 0) throw new Error('empty syllabus');
  return items;
}

export function makeSyllabus(g: Gemini, topic: { name: string; keywords: string; goal?: string }, count = 20) {
  const instruction = `${AUDIENCE}${goalLine(topic.goal)}
Plan a course of ${count} short daily lessons (5 minutes each) on the topic below, from the
fundamentals a newcomer needs up to the ideas behind current research. Each lesson covers
one concept. Order them so each builds on the earlier ones.

Answer only with JSON: { "lessons": [ { "title": "...", "outline": "one sentence on what the lesson covers" } ] }`;
  return generateJson(g, instruction, `Topic: ${topic.name}\nKeywords: ${topic.keywords}`, parseSyllabus, 0.4);
}

// ---- Lesson -----------------------------------------------------------------

function parseQuiz(q: unknown): Quiz {
  const r = (q ?? {}) as {
    question?: unknown;
    options?: unknown[];
    choices?: unknown[];
    answer?: unknown;
    correct?: unknown;
    explanation?: unknown;
  };
  const options = (r.options ?? r.choices ?? [])
    .map((o) => (typeof o === 'string' ? o : str((o as { text?: unknown })?.text)))
    .map(str)
    .filter(Boolean);
  const given = r.answer ?? r.correct;
  let answer = typeof given === 'number' ? given : Number(given);
  if (Number.isNaN(answer) && typeof given === 'string') {
    const letter = given.trim().match(/^([A-Da-d])[).:]?$/)?.[1];
    answer = letter ? letter.toUpperCase().charCodeAt(0) - 65 : options.findIndex((o) => o === given.trim());
  }
  if (!str(r.question) || options.length < 2 || !(answer >= 0 && answer < options.length)) {
    throw new Error('bad quiz');
  }
  return { question: str(r.question), options, answer, explanation: str(r.explanation) };
}

export function parseCards(list: unknown): { front: string; back: string }[] {
  return (Array.isArray(list) ? list : [])
    .map((c) => c as { front?: unknown; back?: unknown; question?: unknown; answer?: unknown })
    .map((c) => ({ front: str(c.front ?? c.question), back: str(c.back ?? c.answer) }))
    .filter((c) => c.front && c.back);
}

export { parseCardList as _parseCardListForTests };

function parseDirections(list: unknown): Direction[] {
  return (Array.isArray(list) ? list : [])
    .map((d) => (typeof d === 'string' ? { title: d } : (d as { title?: unknown; why?: unknown })))
    .map((d) => ({ title: str(d.title), why: str((d as { why?: unknown }).why) }))
    .filter((d) => d.title)
    .slice(0, 3);
}

export function parseLesson(text: string): LessonContent {
  const raw = JSON.parse(text) as {
    body?: unknown;
    keyPoints?: unknown[];
    quiz?: unknown;
    checks?: unknown[];
    deeper?: unknown;
    broader?: unknown;
    cards?: unknown;
  };
  const body = str(raw.body);
  if (!body) throw new Error('empty lesson');
  const checks: Quiz[] = [];
  for (const q of [...(Array.isArray(raw.checks) ? raw.checks : []), ...(raw.quiz ? [raw.quiz] : [])]) {
    try {
      checks.push(parseQuiz(q));
    } catch {
      // a broken question is left out
    }
  }
  if (checks.length === 0) throw new Error('no check question');
  return {
    body,
    keyPoints: (raw.keyPoints ?? []).map(str).filter(Boolean),
    quiz: checks[0],
    checks,
    deeper: parseDirections(raw.deeper),
    broader: parseDirections(raw.broader),
    cards: parseCards(raw.cards),
  };
}

const LESSON_SHAPE = `${FORMULAS}
Answer only with JSON:
{
  "body": "the explanation; '## ' starts a short heading, '- ' a bullet, blank lines between paragraphs",
  "keyPoints": ["3 short takeaways"],
  "checks": [ { "question": "...", "options": ["a", "b", "c", "d"], "answer": 0, "explanation": "why this is right and the others not" } ],
  "deeper": [ { "title": "a concept inside this lesson worth understanding in more depth", "why": "one sentence" } ],
  "broader": [ { "title": "a related idea or a neighbouring field this connects to", "why": "one sentence" } ]
}
Give 2 checks that test understanding (not recall of wording), 2 "deeper" and 2 "broader"
suggestions.`;

// A core lesson of the course: explained, not drilled.
export function makeLesson(
  g: Gemini,
  topic: string,
  lesson: { title: string; outline: string },
  earlier: string[],
  goal?: string
) {
  const instruction = `${AUDIENCE}${goalLine(goal)}
You are a patient tutor. Teach one idea so it is understood, not memorised, in about 400 to
600 words:
## The intuition: what it is and why it exists, with an everyday analogy if one fits.
## How it works: the essentials step by step; a formula only if it really helps, with every
symbol explained in words.
## Example: one concrete case from the topic.
## Where it shows up: how it is used in practice and in current research.
Explain every technical term the first time it appears. Assume the earlier lessons listed.
${LESSON_SHAPE}`;
  const input = [
    `Topic: ${topic}`,
    `Lesson: ${lesson.title}`,
    `Covers: ${lesson.outline}`,
    earlier.length ? `Earlier lessons: ${earlier.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return generateJson(g, instruction, input, parseLesson, 0.4);
}

export type ExploreKind = 'deeper' | 'broader' | 'simpler' | 'question';

// A follow-up from a lesson: go deeper into a concept, widen to a connected idea,
// explain the same thing more simply, or answer the learner's own question.
export function explore(
  g: Gemini,
  input: {
    topic: string;
    goal?: string;
    from: { title: string; keyPoints: string[] };
    kind: ExploreKind;
    target: string; // a suggested title, or the learner's question
    seen: string[]; // titles already covered, to avoid repeating them
  }
) {
  const task = {
    deeper: `Go one level deeper into "${input.target}": the mechanism, the maths in words, the
subtleties and the common misconceptions.`,
    broader: `Widen the view to "${input.target}": what it is, how it connects to the lesson, and what
the learner gains from seeing the link.`,
    simpler: `Explain the lesson again for someone who found it too hard: simpler words, a strong
analogy, one small worked example, no new material.`,
    question: `Answer the learner's question: "${input.target}". Answer it directly first, then
explain the background they need.`,
  }[input.kind];
  const instruction = `${AUDIENCE}${goalLine(input.goal)}
You are a patient tutor in a conversation that started from the lesson "${input.from.title}"
(key points: ${input.from.keyPoints.join('; ')}). ${task}
About 250 to 450 words. Explain every technical term the first time it appears. Do not
repeat what these already covered: ${input.seen.join('; ') || 'nothing yet'}.
${LESSON_SHAPE.replace('Give 2 checks', 'Give 1 check')}`;
  return generateJson(g, instruction, `Topic: ${input.topic}`, parseLesson, 0.4);
}

// ---- Cards from papers and notes ----------------------------------------------

function parseCardList(text: string) {
  const cards = parseCards(listIn(JSON.parse(text), ['cards', 'flashcards']));
  if (cards.length === 0) throw new Error('no cards');
  return cards;
}

const CARD_RULES = `Good flashcards ask one thing, have a short answer (one sentence or a few words),
and test understanding or key facts worth remembering a year from now, not trivia.
Answer only with JSON: { "cards": [ { "front": "question", "back": "answer" } ] }`;

export function cardsFromPaper(g: Gemini, paper: { title: string; text: string }, goal?: string) {
  const instruction = `${AUDIENCE}${goalLine(goal)}
Write 3 to 5 flashcards about the paper below: its key idea, method and main result, and
any concept from it worth knowing in general.
${CARD_RULES}`;
  return generateJson(g, instruction, `Title: ${paper.title}\n\n${paper.text}`, parseCardList);
}

export function cardsFromNote(g: Gemini, note: { title: string; body: string; quote: string }) {
  const instruction = `${AUDIENCE}
Write 1 or 2 flashcards that capture what this note is about.
${CARD_RULES}`;
  const input = [note.title, note.quote && `Quote: ${note.quote}`, note.body].filter(Boolean).join('\n\n');
  return generateJson(g, instruction, input, parseCardList);
}

// ---- Reading paths -------------------------------------------------------------

export type PathCandidate = {
  id: string;
  title: string;
  year: number | null;
  citations: number;
  abstract: string;
};

export type PathChoice = { id: string; era: string; why: string };
export type MissingPaper = { title: string; year: number | null; why: string; era: string };

export function parsePath(text: string, ids: string[]): { path: PathChoice[]; missing: MissingPaper[] } {
  const raw = JSON.parse(text) as { path?: unknown[]; missing?: unknown[] };
  const seen = new Set<string>();
  const path = (raw.path ?? [])
    .map((p) => p as { id?: unknown; era?: unknown; why?: unknown })
    .map((p) => ({ id: String(p.id ?? ''), era: str(p.era) || 'Path', why: str(p.why) }))
    .filter((p) => ids.includes(p.id) && !seen.has(p.id) && seen.add(p.id));
  const missing = (raw.missing ?? [])
    .map((m) => m as { title?: unknown; year?: unknown; why?: unknown; era?: unknown })
    .map((m) => ({
      title: str(m.title),
      year: Number(m.year) || null,
      why: str(m.why),
      era: str(m.era) || 'Foundations',
    }))
    .filter((m) => m.title)
    .slice(0, 6);
  if (path.length === 0) throw new Error('empty path');
  return { path, missing };
}

// Chooses and orders the papers a newcomer must read, from the foundations to today.
// It may only pick from the candidates (all real, from OpenAlex); papers it thinks are
// missing come back separately and are looked up before they are added.
export function buildPath(
  g: Gemini,
  topic: { name: string; keywords: string; goal?: string },
  candidates: PathCandidate[],
  size = 24
) {
  const instruction = `${AUDIENCE}${goalLine(topic.goal)}
You curate a reading path through the literature of one topic, for someone who wants to
understand the field from its foundations up to the current state of the art, one paper
per session. From the candidates (each with year and citation count), choose about
${size} papers:
- the foundations every expert knows, the turning points that changed how the field works,
  the methods everyone uses, the best surveys, and the current state of the art;
- skip incremental variants, narrow applications, duplicates and papers off the topic;
- citation counts favour old papers, so judge recent ones by their influence for their age;
- order them so each builds on the earlier ones: by era ("Foundations", "Milestones",
  "Recent"), and by year within an era.
For each chosen paper say in one sentence why it is on the path. Then list up to 5
must-know papers of this topic that are missing from the candidates (exact title, year).

Answer only with JSON:
{ "path": [ { "id": "...", "era": "Foundations", "why": "..." } ],
  "missing": [ { "title": "...", "year": 2015, "era": "Milestones", "why": "..." } ] }`;
  const input = [
    `Topic: ${topic.name}`,
    `Keywords: ${topic.keywords}`,
    '',
    ...candidates.map(
      (c) => `[${c.id}] (${c.year ?? '?'}, ${c.citations} citations) ${c.title}. ${c.abstract.slice(0, 220)}`
    ),
  ].join('\n');
  return generateJson(g, instruction, input, (t) => parsePath(t, candidates.map((c) => c.id)), 0.2);
}

// One paper of the path, explained by a tutor.
export function explainPaper(
  g: Gemini,
  paper: {
    title: string;
    authors: string;
    year: number | null;
    venue: string;
    text: string;
    fullText: boolean;
  },
  context: { topic: string; goal?: string; before: string[]; after: string[]; why: string }
) {
  const instruction = `${AUDIENCE}${goalLine(context.goal)}
You are a patient tutor walking the learner through the literature of "${context.topic}",
one paper at a time. Explain the paper below so it is understood, in about 500 to 700 words:
## The problem: what was hard or unknown before this paper.
## The key idea: the insight, in plain words, with an analogy if one fits.
## How it works: the method step by step; formulas only where they help, every symbol
explained.
## What they showed: the main results, with the important numbers.
## Why it matters: what it changed and what it led to${context.after.length ? ' (later papers on the path build on it)' : ''}.
Explain every technical term the first time it appears. Connect it to papers the learner
has already read where that helps.${paper.fullText ? '' : ' You only have the abstract: say so briefly where details are missing, and do not invent them.'}
On the path because: ${context.why}
Already read: ${context.before.slice(-8).join('; ') || 'nothing yet'}.
Coming later: ${context.after.slice(0, 5).join('; ') || 'nothing'}.
${LESSON_SHAPE.replace('"deeper": [ { "title": "a concept inside this lesson', '"deeper": [ { "title": "a concept inside this paper')}`;
  const input = [
    `Title: ${paper.title}`,
    `Authors: ${paper.authors}`,
    `Year: ${paper.year ?? '?'}${paper.venue ? `, ${paper.venue}` : ''}`,
    '',
    paper.text,
  ].join('\n');
  return generateJson(g, instruction, input, parseLesson, 0.3);
}
