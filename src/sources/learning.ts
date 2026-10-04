import type { LessonContent, Quiz } from '@/db/types';
import { type Gemini, generateJson } from './gemini';

// Gemini prompts for the Learn part: a fundamentals syllabus per topic, one lesson
// at a time, and flashcards drafted from papers and notes.

const AUDIENCE = `The learner studies biomedical engineering (medical image analysis with deep
learning, EEG, MRI) and wants to understand the field well enough to read current research.
Write in English, plainly, in short sentences.`;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

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

export function makeSyllabus(g: Gemini, topic: { name: string; keywords: string }, count = 20) {
  const instruction = `${AUDIENCE}
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

export function parseLesson(text: string): LessonContent {
  const raw = JSON.parse(text) as { body?: unknown; keyPoints?: unknown[]; quiz?: unknown; cards?: unknown };
  const body = str(raw.body);
  if (!body) throw new Error('empty lesson');
  return {
    body,
    keyPoints: (raw.keyPoints ?? []).map(str).filter(Boolean),
    quiz: parseQuiz(raw.quiz),
    cards: parseCards(raw.cards),
  };
}

export function makeLesson(
  g: Gemini,
  topic: string,
  lesson: { title: string; outline: string },
  earlier: string[]
) {
  const instruction = `${AUDIENCE}
Write one lesson of about 250 to 350 words. Explain the idea with intuition first, then
the essentials (a formula only if it really helps, explained in words). Give a concrete
example from the topic. Assume the learner has done the earlier lessons listed.
Then one multiple-choice question that checks understanding (four options, one correct),
and two or three flashcards worth remembering long-term.

Answer only with JSON:
{
  "body": "paragraphs separated by blank lines",
  "keyPoints": ["3 short takeaways"],
  "quiz": { "question": "...", "options": ["a", "b", "c", "d"], "answer": 0, "explanation": "why" },
  "cards": [ { "front": "question", "back": "short answer" } ]
}`;
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

// ---- Cards from papers and notes ----------------------------------------------

function parseCardList(text: string) {
  const cards = parseCards(listIn(JSON.parse(text), ['cards', 'flashcards']));
  if (cards.length === 0) throw new Error('no cards');
  return cards;
}

const CARD_RULES = `Good flashcards ask one thing, have a short answer (one sentence or a few words),
and test understanding or key facts worth remembering a year from now, not trivia.
Answer only with JSON: { "cards": [ { "front": "question", "back": "answer" } ] }`;

export function cardsFromPaper(g: Gemini, paper: { title: string; text: string }) {
  const instruction = `${AUDIENCE}
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
