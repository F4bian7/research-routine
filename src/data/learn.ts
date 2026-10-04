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
import type { Gemini } from '@/sources/gemini';
import { makeLesson, makeSyllabus } from '@/sources/learning';

export const MAX_REVIEWS = 15;
export const MAX_NEW_CARDS = 5;

export const XP = { lesson: 10, quizRight: 5, card: 2 };

// Key and model from Settings; a model that turns out to work in place of the chosen
// one is saved, so the next request goes there directly.
export async function getGemini(db: Db): Promise<Gemini | null> {
  const s = await getSettings(db);
  if (!s.geminiApiKey) return null;
  return {
    apiKey: s.geminiApiKey,
    model: s.geminiModel,
    onModel: (model) => void setSetting(db, 'geminiModel', model),
  };
}

// The topic whose course has moved least recently, so topics take turns. Without
// Gemini only lessons that are already written can be served.
function nextTopic(topics: Topic[], lessons: Lesson[], canWrite: boolean): Topic | null {
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
  return [...open].sort((a, b) => lastDone(a).localeCompare(lastDone(b)))[0] ?? null;
}

// Today's lesson without calling Gemini: the next planned lesson, if a syllabus exists.
export async function peekLesson(
  db: Db,
  canWrite = true
): Promise<{ lesson: Lesson | null; topic: Topic | null }> {
  const [topics, lessons] = await Promise.all([listTopics(db), listLessons(db)]);
  const topic = nextTopic(topics, lessons, canWrite);
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
    await saveLessonContent(db, lesson.id, await makeLesson(gemini, topic.name, lesson, earlier));
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
