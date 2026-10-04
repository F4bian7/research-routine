import type { Db } from '@/db/db';
import { listQueued, listArchive } from '@/db/repos/papers';
import { addPerson, listPeople } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { Person } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { matchTopics, nameMatches } from '@/domain/match';
import { blueskyHandle } from '@/domain/person-links';
import { type BlueskyActor, followedPosts, getProfiles, searchActors } from '@/sources/bluesky';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import { parsePaperLink } from '@/sources/links';
import {
  type AuthorCandidate,
  authorsOfDois,
  authorWorks,
  type CoAuthor,
  worksByAuthors,
} from '@/sources/openalex';

// Following someone in one step: the OpenAlex profile gives institution and papers,
// the papers give the topics.
export async function followAuthor(db: Db, a: { id: string; name: string; institution: string }) {
  const [topics, works] = await Promise.all([
    listTopics(db),
    authorWorks(a.id).catch(() => [] as FeedPaper[]),
  ]);
  const topicIds = matchTopics(
    topics,
    works.map((w) => `${w.title} ${w.abstract}`)
  );
  return addPerson(db, {
    name: a.name,
    institution: a.institution,
    topicIds,
    links: {},
    openalexId: a.id,
  });
}

export function candidateInstitution(c: AuthorCandidate) {
  return c.institutions[0] ?? '';
}

// Bluesky accounts that really carry the person's name (the search itself is fuzzy).
export async function blueskyCandidates(name: string): Promise<BlueskyActor[]> {
  const found = await searchActors(name);
  return found.filter((a) => nameMatches(name, a.name, a.handle));
}

// Authors who appear most in the backlog and archive, not followed yet.
export async function suggestPeople(db: Db): Promise<CoAuthor[]> {
  const [queued, read, people] = await Promise.all([
    listQueued(db),
    listArchive(db),
    listPeople(db),
  ]);
  const dois = [...queued, ...read]
    .map((p) => parsePaperLink(p.url))
    .map((r) => (r.kind === 'arxiv' ? `10.48550/arxiv.${r.id}` : r.kind === 'doi' ? r.doi : ''))
    .filter(Boolean);
  const followed = new Set(people.map((p) => p.openalexId).filter(Boolean));
  const authors = await authorsOfDois(dois);
  return authors.filter((a) => !followed.has(a.id)).slice(0, 8);
}

// ---- Timeline ------------------------------------------------------------------

export type TimelineItem =
  | { kind: 'paper'; at: string; person: Person; paper: FeedPaper }
  | { kind: 'post'; at: string; person: Person; post: BlueskyPost };

export type Timeline = { items: TimelineItem[]; avatars: Map<string, string> };

let cache: { key: string; value: Promise<Timeline> } | null = null;

// Papers and Bluesky posts of everyone followed, newest first.
export function loadTimeline(people: Person[], refresh = false): Promise<Timeline> {
  const key = people.map((p) => `${p.id}:${p.openalexId}:${p.links.bluesky ?? ''}`).join('|');
  if (!refresh && cache?.key === key) return cache.value;
  const value = buildTimeline(people);
  cache = { key, value };
  value.catch(() => {
    if (cache?.value === value) cache = null;
  });
  return value;
}

async function buildTimeline(people: Person[]): Promise<Timeline> {
  const today = todayKey();
  const byAuthor = new Map(people.filter((p) => p.openalexId).map((p) => [p.openalexId!, p]));
  const withHandle = people
    .map((p) => ({ p, handle: blueskyHandle(p.links.bluesky) }))
    .filter((x): x is { p: Person; handle: string } => !!x.handle);

  const [papers, postLists, profiles] = await Promise.all([
    worksByAuthors([...byAuthor.keys()]).catch(() => [] as FeedPaper[]),
    Promise.all(
      withHandle.map(({ p, handle }) =>
        followedPosts(handle)
          .then((posts) => posts.slice(0, 10).map((post) => ({ p, post })))
          .catch(() => [])
      )
    ),
    getProfiles(withHandle.map((x) => x.handle)).catch(() => new Map<string, BlueskyActor>()),
  ]);

  const items: TimelineItem[] = [];
  for (const paper of papers) {
    const person = paper.authorIds?.map((id) => byAuthor.get(id)).find(Boolean);
    if (!person) continue;
    // Journals often date issues ahead; show those as today.
    const day = paper.date > today ? today : paper.date;
    items.push({ kind: 'paper', at: `${day}T12:00:00Z`, person, paper });
  }
  for (const { p, post } of postLists.flat()) {
    // Reposts of others show up in author feeds too; keep the person's own posts.
    if (blueskyHandle(p.links.bluesky) !== post.handle) continue;
    items.push({ kind: 'post', at: post.createdAt, person: p, post });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  const avatars = new Map<string, string>();
  for (const { p, handle } of withHandle) {
    const avatar = profiles.get(handle)?.avatar;
    if (avatar) avatars.set(String(p.id), avatar);
  }
  return { items, avatars };
}
