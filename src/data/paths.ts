import type { Db } from '@/db/db';
import { addToPath, listPath, type PathItem } from '@/db/repos/lessons';
import { listQueued, listArchive } from '@/db/repos/papers';
import type { Lesson, Topic } from '@/db/types';
import { addDays, todayKey } from '@/domain/dates';
import { parseKeywords, keywordQuery } from '@/domain/keywords';
import { arxivMetaFromHtml, fetchArxivHtml } from '@/sources/arxiv';
import type { FeedPaper } from '@/sources/feed-types';
import type { Gemini } from '@/sources/gemini';
import { buildPath, type MissingPaper, type PathCandidate } from '@/sources/learning';
import { canonicalUrl, parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';
import { findByTitle, mostCited } from '@/sources/openalex';

const ERA_ORDER = ['Foundations', 'Milestones', 'Recent'];
const eraRank = (era: string) => {
  const i = ERA_ORDER.findIndex((e) => e.toLowerCase() === era.toLowerCase());
  return i < 0 ? 1 : i;
};

const urlKey = (url: string) => canonicalUrl(parsePaperLink(url)).toLowerCase();

async function inTurns<T>(jobs: (() => Promise<T>)[], limit = 3): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += limit) {
    const settled = await Promise.allSettled(jobs.slice(i, i + limit).map((j) => j()));
    for (const r of settled) if (r.status === 'fulfilled') out.push(r.value);
  }
  return out;
}

// Real papers to choose from: the most cited ones per keyword (all time, and of the last
// three years so recent work is not drowned by old citation counts), plus the topic's
// papers already in the library.
async function candidatesFor(db: Db, topic: Topic, recentOnly: boolean): Promise<FeedPaper[]> {
  const keywords = parseKeywords(topic.keywords).slice(0, 6);
  const recent = addDays(todayKey(), -3 * 365);
  const jobs = keywords.flatMap((k) => {
    const q = keywordQuery([k]);
    return recentOnly ? [() => mostCited(q, recent, 25)] : [() => mostCited(q, undefined, 25), () => mostCited(q, recent, 15)];
  });
  const found = (await inTurns(jobs)).flat();
  const library = [...(await listQueued(db, topic.id)), ...(await listArchive(db))].filter(
    (p) => p.topicId === topic.id
  );
  const all = new Map<string, FeedPaper>();
  for (const p of found) if (!all.has(urlKey(p.url))) all.set(urlKey(p.url), p);
  for (const p of library) {
    if (all.has(urlKey(p.url))) continue;
    all.set(urlKey(p.url), {
      id: p.url,
      title: p.title,
      authors: p.authors,
      year: p.year,
      date: '',
      url: p.url,
      abstract: p.note,
      venue: '',
      topicId: topic.id,
      citations: 0,
    });
  }
  return [...all.values()].sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0)).slice(0, 140);
}

function toItem(p: FeedPaper, era: string, why: string): PathItem {
  return {
    title: p.title,
    url: canonicalUrl(parsePaperLink(p.url)),
    meta: { authors: p.authors, year: p.year, venue: p.venue, citations: p.citations ?? 0, era, why },
  };
}

// Orders by era, then year: foundations first, today last.
export function orderPath(items: PathItem[]): PathItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort(
      (a, b) =>
        eraRank(a.it.meta.era ?? '') - eraRank(b.it.meta.era ?? '') ||
        (a.it.meta.year ?? 0) - (b.it.meta.year ?? 0) ||
        a.i - b.i
    )
    .map((x) => x.it);
}

async function verifyMissing(missing: MissingPaper[]): Promise<PathItem[]> {
  const found = await inTurns(
    missing.map((m) => async () => {
      const p = await findByTitle(m.title);
      return p ? toItem(p, m.era, m.why) : null;
    })
  );
  return found.filter((x): x is PathItem => !!x);
}

// Plans a topic's reading path: real candidates from OpenAlex, chosen and ordered by
// Gemini, papers it names as missing added only when OpenAlex finds them.
export async function planPath(db: Db, g: Gemini, topic: Topic): Promise<number> {
  const candidates = await candidatesFor(db, topic, false);
  if (candidates.length === 0) throw new Error('No papers found for this topic. Check its keywords.');
  const ids = candidates.map((_, i) => `p${i + 1}`);
  const input: PathCandidate[] = candidates.map((c, i) => ({
    id: ids[i],
    title: c.title,
    year: c.year,
    citations: c.citations ?? 0,
    abstract: c.abstract,
  }));
  const { path, missing } = await buildPath(g, topic, input);
  const chosen = path.map((p) => toItem(candidates[ids.indexOf(p.id)], p.era, p.why));
  const extra = await verifyMissing(missing);
  return addToPath(db, topic.id, orderPath([...chosen, ...extra]));
}

// Looks for important new work since the path was planned and adds it at the end.
export async function extendPath(db: Db, g: Gemini, topic: Topic): Promise<number> {
  const onPath = new Set((await listPath(db, topic.id)).map((l) => urlKey(l.paperUrl)));
  const candidates = (await candidatesFor(db, topic, true)).filter((c) => !onPath.has(urlKey(c.url)));
  if (candidates.length === 0) return 0;
  const ids = candidates.map((_, i) => `p${i + 1}`);
  const { path } = await buildPath(
    g,
    { ...topic, goal: `${topic.goal ?? ''} The learner already follows a reading path; only add recent papers that clearly matter.` },
    candidates.map((c, i) => ({ id: ids[i], title: c.title, year: c.year, citations: c.citations ?? 0, abstract: c.abstract })),
    6
  );
  const chosen = path.map((p) => toItem(candidates[ids.indexOf(p.id)], 'Recent', p.why));
  return addToPath(db, topic.id, orderPath(chosen));
}

// What the tutor reads: the full text for arXiv papers, otherwise the abstract.
export async function paperText(lesson: Lesson): Promise<{ text: string; full: boolean }> {
  const ref = parsePaperLink(lesson.paperUrl);
  if (ref.kind === 'arxiv') {
    const html = await fetchArxivHtml(ref.id).catch(() => null);
    if (html) {
      const abstract = arxivMetaFromHtml(ref.id, html.html).abstract;
      const body = html.html
        // Formulas keep their LaTeX source (LaTeXML puts it in alttext).
        .replace(/<math[^>]*alttext="([^"]*)"[\s\S]*?<\/math>/gi, (_m, tex: string) => ` $${tex}$ `)
        .replace(/<(script|style|math|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<section[^>]*ltx_bibliography[\s\S]*$/i, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ');
      return { text: `${abstract}\n\n${body}`.slice(0, 30_000), full: true };
    }
  }
  const meta = await fetchMeta(ref).catch(() => null);
  return { text: meta?.abstract || lesson.paperMeta.why || lesson.title, full: false };
}
