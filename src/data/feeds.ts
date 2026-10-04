import { router } from 'expo-router';

import type { Db } from '@/db/db';
import { setFeedDecision } from '@/db/repos/feed';
import { addPaper, findPaperByUrl } from '@/db/repos/papers';
import type { Topic } from '@/db/types';
import { addDays, todayKey } from '@/domain/dates';
import { keywordQuery, parseKeywords } from '@/domain/keywords';
import { followedPosts, searchPaperPosts } from '@/sources/bluesky';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import { fetchTrending } from '@/sources/huggingface';
import { canonicalUrl, parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';
import { searchRecent } from '@/sources/openalex';

// Runs async jobs with at most `limit` in flight, to stay polite to free APIs.
async function pool<T>(jobs: (() => Promise<T>)[], limit: number) {
  const results: PromiseSettledResult<T>[] = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]().then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason })
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

// Feed results live for the session, so switching tabs does not refetch.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>, refresh: boolean): Promise<T> {
  if (refresh || !cache.has(key)) {
    const p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key) as Promise<T>;
}

export const NEW_PAPERS_DAYS = 7;
const BLUESKY_MAX = 60;

// arXiv and PubMed papers of the last week, per topic, newest first.
export function loadNewPapers(topics: Topic[], refresh = false): Promise<FeedPaper[]> {
  const from = addDays(todayKey(), -NEW_PAPERS_DAYS);
  const key = `new:${from}:${topics.map((t) => `${t.id}=${t.keywords}`).join('|')}`;
  return cached(
    key,
    async () => {
      // One request per keyword and source: OpenAlex refuses large boolean queries.
      const jobs = topics.flatMap((t) =>
        parseKeywords(t.keywords).flatMap((k) => {
          const q = keywordQuery([k]);
          return [
            () => searchRecent(q, 'arxiv', from, t.id),
            () => searchRecent(q, 'pubmed', from, t.id),
          ];
        })
      );
      const results = await pool(jobs, 4);
      if (jobs.length && results.every((r) => r.status === 'rejected')) {
        throw new Error('All searches failed');
      }
      const seen = new Map<string, FeedPaper>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const p of r.value) if (!seen.has(p.id)) seen.set(p.id, p);
      }
      // Journals often carry a future print date; sort those as if published today.
      const today = todayKey();
      const sortDate = (p: FeedPaper) => (p.date > today ? today : p.date);
      return [...seen.values()].sort((a, b) => sortDate(b).localeCompare(sortDate(a)));
    },
    refresh
  );
}

export function loadTrending(refresh = false): Promise<FeedPaper[]> {
  return cached(`trending:${todayKey()}`, fetchTrending, refresh);
}

// The user's accounts or list if set, otherwise arXiv-linking posts per topic keyword.
export function loadBluesky(
  source: string,
  topics: Topic[],
  refresh = false
): Promise<BlueskyPost[]> {
  const keywords = topics.flatMap((t) => parseKeywords(t.keywords));
  const key = `bsky:${source}:${keywords.join('|')}`;
  return cached(
    key,
    async () => {
      if (source.trim()) return followedPosts(source);
      const results = await Promise.allSettled(
        keywords.map((k) => searchPaperPosts(k.replace(/"/g, '')))
      );
      const seen = new Map<string, BlueskyPost>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const p of r.value) if (!seen.has(p.uri)) seen.set(p.uri, p);
      }
      return [...seen.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, BLUESKY_MAX);
    },
    refresh
  );
}

// Puts a feed paper into the backlog (once) and returns its id.
export async function saveFeedPaper(db: Db, p: FeedPaper): Promise<number> {
  const url = canonicalUrl(parsePaperLink(p.url));
  const existing = await findPaperByUrl(db, url);
  const id =
    existing?.id ??
    (await addPaper(db, {
      title: p.title,
      url,
      authors: p.authors,
      year: p.year,
      topicId: p.topicId,
      type: 'other',
    }));
  await setFeedDecision(db, p.id, 'saved');
  return id;
}

export async function readFeedPaper(db: Db, p: FeedPaper) {
  const id = await saveFeedPaper(db, p);
  router.push({ pathname: '/paper/[id]', params: { id: String(id) } });
}

// A Bluesky post's linked paper as a feed paper, or null if it links to none.
export async function paperFromPost(post: BlueskyPost): Promise<FeedPaper | null> {
  if (!post.paperUrl) return null;
  const ref = parsePaperLink(post.paperUrl);
  if (ref.kind === 'url') return null;
  const meta = await fetchMeta(ref).catch(() => null);
  const id = ref.kind === 'arxiv' ? `arxiv:${ref.id}` : `doi:${ref.doi.toLowerCase()}`;
  return {
    id,
    title: meta?.title || post.link?.title || post.paperUrl,
    authors: meta?.authors ?? '',
    year: meta?.year ?? null,
    date: post.createdAt.slice(0, 10),
    url: canonicalUrl(ref),
    abstract: meta?.abstract || post.link?.description || '',
    venue: meta?.venue ?? '',
    topicId: null,
  };
}
