import type { Db } from '@/db/db';
import { listArchive, listQueued } from '@/db/repos/papers';
import { addPerson, listPeople, newPerson, updatePerson } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { AuthorProfile, Person } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { matchTopics, nameMatches, normalizeName } from '@/domain/match';
import { blueskyHandle, githubUser } from '@/domain/person-links';
import {
  type BlueskyActor,
  followedPosts,
  getProfiles,
  resolveDid,
  searchActors,
} from '@/sources/bluesky';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import { parsePaperLink } from '@/sources/links';
import { fetchFeed, githubRepos, hnMentions, type WebItem } from '@/sources/web';
import {
  authorsOfDois,
  type CoAuthor,
  searchAuthors,
  worksByAuthors,
  worksByOrcids,
} from '@/sources/openalex';

// ---- Papers of a person ----------------------------------------------------------

// Everything known for a person: all linked profiles plus their ORCID, merged.
export async function worksForPeople(people: Person[], perPage = 50, fresh = false): Promise<FeedPaper[]> {
  const ids = [...new Set(people.flatMap((p) => p.openalexIds))];
  const orcids = [...new Set(people.map((p) => p.orcid).filter((o): o is string => !!o))];
  const [byId, byOrcid] = await Promise.all([
    worksByAuthors(ids, perPage, fresh),
    worksByOrcids(orcids, perPage, fresh).catch(() => [] as FeedPaper[]),
  ]);
  const seen = new Map<string, FeedPaper>();
  for (const p of [...byId, ...byOrcid]) {
    const prev = seen.get(p.id);
    if (!prev) seen.set(p.id, p);
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function paperBelongsTo(paper: FeedPaper, person: Person) {
  return (
    (paper.authorIds ?? []).some((id) => person.openalexIds.includes(id)) ||
    (!!person.orcid && (paper.authorOrcids ?? []).includes(person.orcid))
  );
}

// ---- Following -------------------------------------------------------------------

// Profiles from a name search that probably belong to the same person as `main`:
// same ORCID, or the same name and a shared institution.
export function likelySame(main: AuthorProfile, others: AuthorProfile[]): string[] {
  const inst = new Set(main.institutions);
  return others
    .filter((o) => o.id !== main.id)
    .filter(
      (o) =>
        (!!main.orcid && o.orcid === main.orcid) ||
        (normalizeName(o.name) === normalizeName(main.name) &&
          (o.institutions.length === 0 || o.institutions.some((i) => inst.has(i))))
    )
    .map((o) => o.id);
}

// Follows the chosen profiles as one person. If that person is already followed
// (same profile or same name), the profiles are added to them instead.
export async function followProfiles(db: Db, profiles: AuthorProfile[]): Promise<number> {
  const main = [...profiles].sort((a, b) => b.works - a.works)[0];
  const ids = profiles.map((p) => p.id);
  const orcid = profiles.find((p) => p.orcid)?.orcid ?? null;
  const [topics, people, works] = await Promise.all([
    listTopics(db),
    listPeople(db),
    worksByAuthors(ids, 25).catch(() => [] as FeedPaper[]),
  ]);
  const existing = people.find(
    (p) =>
      p.openalexIds.some((id) => ids.includes(id)) ||
      normalizeName(p.name) === normalizeName(main.name)
  );
  if (existing) {
    await updatePerson(db, {
      ...existing,
      openalexIds: [...new Set([...existing.openalexIds, ...ids])],
      orcid: existing.orcid ?? orcid,
      pendingProfiles: existing.pendingProfiles.filter((c) => !ids.includes(c.id)),
    });
    return existing.id;
  }
  const topicIds = matchTopics(
    topics,
    works.map((w) => `${w.title} ${w.abstract}`)
  );
  return addPerson(
    db,
    newPerson({
      name: main.name,
      institution: main.institutions[0] ?? '',
      topicIds,
      openalexIds: ids,
      orcid,
      checkedAt: new Date().toISOString(),
    })
  );
}

export async function setBluesky(db: Db, person: Person, handle: string | null) {
  const did = handle ? await resolveDid(handle) : null;
  await updatePerson(db, {
    ...person,
    links: { ...person.links, bluesky: handle ?? undefined },
    blueskyDid: did,
  });
}

// Bluesky accounts that really carry the person's name (the search itself is fuzzy).
export async function blueskyCandidates(name: string): Promise<BlueskyActor[]> {
  const found = await searchActors(name);
  return found.filter((a) => nameMatches(name, a.name, a.handle));
}

// ---- Keeping profiles complete ----------------------------------------------------

const RECHECK_MS = 7 * 24 * 3600 * 1000;

export function needsCheck(p: Person) {
  return !p.checkedAt || Date.now() - new Date(p.checkedAt).getTime() > RECHECK_MS;
}

// Searches OpenAlex for profiles that appeared since following. Same ORCID: added
// right away. Same name: kept as "pending" until the user says yes or no.
export async function checkProfiles(db: Db, person: Person): Promise<Person> {
  const found = await searchAuthors(person.name);
  const known = new Set([...person.openalexIds, ...person.ignoredIds]);
  const fresh = found.filter((c) => !known.has(c.id) && nameMatches(person.name, c.name));
  const sure = fresh.filter((c) => !!person.orcid && c.orcid === person.orcid);
  const maybe = fresh.filter((c) => !sure.includes(c));
  const pendingIds = new Set(person.pendingProfiles.map((c) => c.id));
  const updated: Person = {
    ...person,
    openalexIds: [...person.openalexIds, ...sure.map((c) => c.id)],
    orcid: person.orcid ?? fresh.find((c) => c.orcid && sure.includes(c))?.orcid ?? null,
    pendingProfiles: [...person.pendingProfiles, ...maybe.filter((c) => !pendingIds.has(c.id))],
    checkedAt: new Date().toISOString(),
  };
  await updatePerson(db, updated);
  return updated;
}

export async function resolvePending(db: Db, person: Person, profileId: string, same: boolean) {
  const profile = person.pendingProfiles.find((c) => c.id === profileId);
  await updatePerson(db, {
    ...person,
    pendingProfiles: person.pendingProfiles.filter((c) => c.id !== profileId),
    openalexIds: same ? [...person.openalexIds, profileId] : person.openalexIds,
    ignoredIds: same ? person.ignoredIds : [...person.ignoredIds, profileId],
    orcid: person.orcid ?? (same ? (profile?.orcid ?? null) : null),
  });
}

// Checks up to `limit` people whose last check is older than a week.
export async function checkDuePeople(db: Db, limit = 5) {
  const due = (await listPeople(db)).filter((p) => p.openalexIds.length > 0 && needsCheck(p));
  for (const p of due.slice(0, limit)) await checkProfiles(db, p).catch(() => undefined);
}

// ---- Suggestions -------------------------------------------------------------------

export type Suggestion = CoAuthor & { ids: string[] };

// Authors who appear most in the backlog and archive, not followed yet. Split
// profiles of the same name are merged into one suggestion.
export async function suggestPeople(db: Db): Promise<Suggestion[]> {
  const [queued, read, people] = await Promise.all([
    listQueued(db),
    listArchive(db),
    listPeople(db),
  ]);
  const dois = [...queued, ...read]
    .map((p) => parsePaperLink(p.url))
    .map((r) => (r.kind === 'arxiv' ? `10.48550/arxiv.${r.id}` : r.kind === 'doi' ? r.doi : ''))
    .filter(Boolean);
  const followedIds = new Set(people.flatMap((p) => p.openalexIds));
  const followedNames = new Set(people.map((p) => normalizeName(p.name)));
  const byName = new Map<string, Suggestion>();
  for (const a of await authorsOfDois(dois)) {
    const key = normalizeName(a.name);
    if (followedIds.has(a.id) || followedNames.has(key)) continue;
    const s = byName.get(key);
    if (s) {
      s.count += a.count;
      s.ids.push(a.id);
    } else byName.set(key, { ...a, ids: [a.id] });
  }
  return [...byName.values()].sort((x, y) => y.count - x.count).slice(0, 8);
}

// ---- Timeline ------------------------------------------------------------------

export type TimelineItem =
  | { kind: 'paper'; at: string; person: Person; paper: FeedPaper }
  | { kind: 'post'; at: string; person: Person; post: BlueskyPost }
  | { kind: 'web'; at: string; person: Person; item: WebItem };

// Blog posts, new GitHub repositories, and, for people without papers (bloggers,
// engineers, public voices), Hacker News stories about them.
export async function webForPerson(p: Person): Promise<WebItem[]> {
  const gh = githubUser(p.links.github);
  const jobs: Promise<WebItem[]>[] = [];
  if (p.links.blog) jobs.push(fetchFeed(p.links.blog));
  if (gh) jobs.push(githubRepos(gh));
  if (p.openalexIds.length === 0) jobs.push(hnMentions(p.name));
  const results = await Promise.allSettled(jobs);
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export type Timeline = { items: TimelineItem[]; avatars: Map<string, string> };

let cache: { key: string; value: Promise<Timeline> } | null = null;

export function peopleKey(people: Person[]) {
  return people
    .map(
      (p) =>
        `${p.id}:${p.openalexIds.join('+')}:${p.orcid}:${p.blueskyDid ?? p.links.bluesky ?? ''}:${p.links.github ?? ''}:${p.links.blog ?? ''}`
    )
    .join('|');
}

// Bluesky identity to fetch with: the DID if known, else the handle.
export function blueskyActor(p: Person) {
  return p.blueskyDid ?? blueskyHandle(p.links.bluesky);
}

// Papers and Bluesky posts of everyone followed, newest first.
export function loadTimeline(people: Person[], refresh = false): Promise<Timeline> {
  const key = peopleKey(people);
  if (!refresh && cache?.key === key) return cache.value;
  const value = buildTimeline(people, refresh);
  cache = { key, value };
  value.catch(() => {
    if (cache?.value === value) cache = null;
  });
  return value;
}

async function buildTimeline(people: Person[], fresh: boolean): Promise<Timeline> {
  const today = todayKey();
  const withBsky = people
    .map((p) => ({ p, actor: blueskyActor(p) }))
    .filter((x): x is { p: Person; actor: string } => !!x.actor);

  const [papers, postLists, profiles, webLists] = await Promise.all([
    worksForPeople(people, 50, fresh).catch(() => [] as FeedPaper[]),
    Promise.all(
      withBsky.map(({ p, actor }) =>
        followedPosts(actor)
          .then((posts) => posts.slice(0, 10).map((post) => ({ p, post })))
          .catch(() => [])
      )
    ),
    getProfiles(withBsky.map((x) => x.actor)).catch(() => new Map<string, BlueskyActor>()),
    Promise.all(people.map((p) => webForPerson(p).then((items) => items.slice(0, 8).map((item) => ({ p, item }))))),
  ]);

  const items: TimelineItem[] = [];
  for (const paper of papers) {
    const person = people.find((p) => paperBelongsTo(paper, p));
    if (!person) continue;
    // Journals often date issues ahead; show those as today.
    const day = paper.date > today ? today : paper.date;
    items.push({ kind: 'paper', at: `${day}T12:00:00Z`, person, paper });
  }
  for (const { p, post } of postLists.flat()) {
    // Author feeds include reposts of others; keep the person's own posts.
    const own = p.blueskyDid ? post.did === p.blueskyDid : post.handle === blueskyHandle(p.links.bluesky);
    if (own) items.push({ kind: 'post', at: post.createdAt, person: p, post });
  }
  for (const { p, item } of webLists.flat()) items.push({ kind: 'web', at: item.at, person: p, item });
  items.sort((a, b) => b.at.localeCompare(a.at));

  const avatars = new Map<string, string>();
  for (const { p, actor } of withBsky) {
    const avatar = profiles.get(actor)?.avatar;
    if (avatar) avatars.set(String(p.id), avatar);
  }
  return { items, avatars };
}
