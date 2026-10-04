import type { Db } from '@/db/db';
import { dueCards, newCards } from '@/db/repos/cards';
import { markDone } from '@/db/repos/completions';
import { logLearning } from '@/db/repos/learn';
import {
  addExploration,
  getLesson,
  listExplorations,
  listPath,
  markLessonDone,
  saveLessonContent,
} from '@/db/repos/lessons';
import { getSettings, setSetting } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { Card, Lesson, Topic } from '@/db/types';
import { type Gemini, GEMMA_AUTO } from '@/sources/gemini';
import { explainPaper, explore, type ExploreKind } from '@/sources/learning';
import { addPaper, findPaperByUrl, markRead } from '@/db/repos/papers';
import { canonicalUrl, parsePaperLink } from '@/sources/links';
import { paperText, planPath } from './paths';

export const MAX_REVIEWS = 15;
export const MAX_NEW_CARDS = 5;

export const XP = { lesson: 10, exploration: 5, quizRight: 5, card: 2 };

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

// The next paper of the reading path, without calling Gemini.
export async function peekLesson(
  db: Db,
  canWrite = true
): Promise<{ lesson: Lesson | null; topic: Topic | null }> {
  const [topics, lessons, settings] = await Promise.all([listTopics(db), listPath(db), getSettings(db)]);
  const topic = nextTopic(topics, lessons, canWrite, settings.focusTopicId);
  const lesson = topic
    ? (lessons.find((l) => l.topicId === topic.id && l.status === 'planned') ?? null)
    : null;
  return { lesson, topic };
}

// The next paper with its explanation: plans the topic's reading path first if it has
// none, and lets Gemini explain the paper when it is due. Returns null when there is
// nothing to teach (no topic, or no key and nothing written yet).
export async function prepareLesson(db: Db): Promise<{ lesson: Lesson; topic: Topic } | null> {
  const gemini = await getGemini(db);
  let { lesson, topic } = await peekLesson(db, !!gemini);
  if (!topic) return null;
  if (!gemini) return lesson?.content ? { lesson, topic } : null;
  if (!lesson) {
    await planPath(db, gemini, topic);
    lesson = (await listPath(db, topic.id)).find((l) => l.status === 'planned') ?? null;
    if (!lesson) return null;
  }
  if (!lesson.content) {
    const path = await listPath(db, topic.id);
    const i = path.findIndex((l) => l.id === lesson!.id);
    const { text, full } = await paperText(lesson);
    const m = lesson.paperMeta;
    await saveLessonContent(
      db,
      lesson.id,
      await explainPaper(
        gemini,
        { title: lesson.title, authors: m.authors ?? '', year: m.year ?? null, venue: m.venue ?? '', text, fullText: full },
        {
          topic: topic.name,
          goal: topic.goal,
          before: path.slice(0, i).map((l) => l.title),
          after: path.slice(i + 1).map((l) => l.title),
          why: m.why ?? '',
        }
      )
    );
    lesson = (await getLesson(db, lesson.id))!;
  }
  return { lesson, topic };
}

export async function finishLesson(db: Db, lesson: Lesson) {
  if (lesson.status !== 'done') await markLessonDone(db, lesson.id);
}

// A follow-up from a lesson, saved as an exploration under it so it can be reread.
export async function exploreFrom(
  db: Db,
  root: Lesson,
  kind: ExploreKind,
  target: string
): Promise<Lesson> {
  const gemini = await getGemini(db);
  if (!gemini) throw new Error('Add the free Gemini key in Settings first.');
  const [topic, earlier] = await Promise.all([
    root.topicId ? listTopics(db).then((ts) => ts.find((t) => t.id === root.topicId)) : undefined,
    listExplorations(db, root.id),
  ]);
  const content = await explore(gemini, {
    topic: topic?.name ?? '',
    goal: topic?.goal,
    from: { title: root.title, keyPoints: root.content?.keyPoints ?? [] },
    kind,
    target,
    seen: [root.title, ...earlier.map((e) => e.title)],
  });
  const title =
    kind === 'simpler' ? `${root.title}, explained more simply` : kind === 'question' ? target : target;
  const id = await addExploration(db, root, kind, title, kind === 'question' ? target : '', content);
  return (await getLesson(db, id))!;
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

// Puts the paper of a finished path session into the library as read.
export async function markPaperRead(db: Db, lesson: Lesson) {
  const url = canonicalUrl(parsePaperLink(lesson.paperUrl));
  const existing = await findPaperByUrl(db, url);
  const id =
    existing?.id ??
    (await addPaper(db, {
      title: lesson.title,
      url,
      authors: lesson.paperMeta.authors ?? '',
      year: lesson.paperMeta.year ?? null,
      topicId: lesson.topicId,
      type: 'milestone',
      note: lesson.paperMeta.why ?? '',
    }));
  if (existing?.status !== 'read') await markRead(db, id);
}
