import type { Db } from '@/db/db';
import { addCards, dueCards, newCards } from '@/db/repos/cards';
import { markDone } from '@/db/repos/completions';
import { logLearning } from '@/db/repos/learn';
import {
  addSyllabus,
  getLesson,
  listLessons,
  markLessonDone,
  saveLessonContent,
} from '@/db/repos/lessons';
import { getSettings, setSetting } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { Card, Lesson, Topic } from '@/db/types';
import { type Gemini, GEMMA_AUTO } from '@/sources/gemini';
import { makeLesson, makeSyllabus } from '@/sources/learning';

export const MAX_REVIEWS = 15;
export const MAX_NEW_CARDS = 5;

export const XP = { lesson: 10, quizRight: 5, card: 2 };

// Free-tier limits (AI Studio, 2026-10): every Flash model has its own 20 requests a
// day, the Flash-Lite models 500, Gemma 4 about 14,400 (but only 16K tokens a minute).
// Quality work (lessons, course plans, summaries) walks through the Flash models, then
// Flash-Lite; the many small requests (ratings, explanations, cards) use Flash-Lite and
// fall back to Gemma. A model out of quota is skipped until it has quota again.
const QUALITY_POOL = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const FAST_POOL = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export type GeminiUse = 'quality' | 'fast';

// Older settings hold the alias, which points at the newest Flash.
const resolveAlias = (m: string) => (m === 'gemini-flash-latest' ? QUALITY_POOL[0] : m);

export async function getGemini(db: Db, use: GeminiUse = 'quality'): Promise<Gemini | null> {
  const s = await getSettings(db);
  if (!s.geminiApiKey) return null;
  const key = use === 'quality' ? 'geminiModel' : 'geminiFastModel';
  const model = resolveAlias(use === 'quality' ? s.geminiModel : s.geminiFastModel);
  const chain =
    use === 'quality'
      ? [...QUALITY_POOL, resolveAlias(s.geminiFastModel), ...FAST_POOL, GEMMA_AUTO]
      : [...FAST_POOL, GEMMA_AUTO];
  return {
    apiKey: s.geminiApiKey,
    model,
    fallbacks: chain.filter((m, i) => m !== model && chain.indexOf(m) === i),
    onModel: (m) => void setSetting(db, key, m),
  };
}

// The topic whose course has moved least recently, so topics take turns. Without
// Gemini only lessons that are already written can be served.
function nextTopic(
  topics: Topic[],
  lessons: Lesson[],
  canWrite: boolean,
  focusId: number | null
): Topic | null {
  const lastDone = (t: Topic) =>
    lessons
      .filter((l) => l.topicId === t.id && l.doneAt)
      .map((l) => l.doneAt!)
      .sort()
      .pop() ?? '';
  const nextOf = (t: Topic) => lessons.find((l) => l.topicId === t.id && l.status === 'planned');
  const open = topics.filter((t) => {
    const next = nextOf(t);
    if (canWrite) return !!next || !lessons.some((l) => l.topicId === t.id);
    return !!next?.content;
  });
  // A focused topic (for example a thesis) gets every lesson until its course is done.
  const focused = open.find((t) => t.id === focusId);
  if (focused) return focused;
  return [...open].sort((a, b) => lastDone(a).localeCompare(lastDone(b)))[0] ?? null;
}

// Today's lesson without calling Gemini: the next planned lesson, if a syllabus exists.
export async function peekLesson(
  db: Db,
  canWrite = true
): Promise<{ lesson: Lesson | null; topic: Topic | null }> {
  const [topics, lessons, settings] = await Promise.all([listTopics(db), listLessons(db), getSettings(db)]);
  const topic = nextTopic(topics, lessons, canWrite, settings.focusTopicId);
  const lesson = topic
    ? (lessons.find((l) => l.topicId === topic.id && l.status === 'planned') ?? null)
    : null;
  return { lesson, topic };
}

// Today's lesson with its text, creating the syllabus and the lesson with Gemini when
// needed. Returns null when there is nothing to teach (no topic, or no key and nothing
// written yet).
export async function prepareLesson(db: Db): Promise<{ lesson: Lesson; topic: Topic } | null> {
  const gemini = await getGemini(db);
  let { lesson, topic } = await peekLesson(db, !!gemini);
  if (!topic) return null;
  if (!gemini) return lesson?.content ? { lesson, topic } : null;
  if (!lesson) {
    await addSyllabus(db, topic.id, await makeSyllabus(gemini, topic));
    lesson = (await listLessons(db, topic.id)).find((l) => l.status === 'planned') ?? null;
    if (!lesson) return null;
  }
  if (!lesson.content) {
    const earlier = (await listLessons(db, topic.id))
      .filter((l) => l.position < lesson!.position)
      .map((l) => l.title);
    await saveLessonContent(db, lesson.id, await makeLesson(gemini, topic.name, lesson, earlier, topic.goal));
    lesson = (await getLesson(db, lesson.id))!;
  }
  return { lesson, topic };
}

// Finishing a lesson turns its suggested flashcards into cards for review.
export async function finishLesson(db: Db, lesson: Lesson) {
  await markLessonDone(db, lesson.id);
  await addCards(
    db,
    (lesson.content?.cards ?? []).map((c) => ({
      ...c,
      source: 'lesson' as const,
      status: 'active' as const,
      lessonId: lesson.id,
      topicId: lesson.topicId,
    }))
  );
}

export async function sessionCards(db: Db, today: string): Promise<Card[]> {
  const [due, fresh] = await Promise.all([dueCards(db, today, MAX_REVIEWS), newCards(db, MAX_NEW_CARDS)]);
  return [...due, ...fresh];
}

// A finished session counts for the streak.
export async function completeSession(
  db: Db,
  today: string,
  result: { xp: number; reviewed: number; lessonId: number | null }
) {
  await logLearning(db, today, result.xp, result.reviewed, result.lessonId);
  await markDone(db, today, 'Learn session');
}
