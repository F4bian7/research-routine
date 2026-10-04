import type { Db } from '@/db/db';
import { addPaper, findPaperByUrl, frontPosition } from '@/db/repos/papers';
import { addPerson, listPeople, newPerson } from '@/db/repos/people';
import { getSettings, setSetting } from '@/db/repos/settings';
import { addTopic, listTopics, updateTopic } from '@/db/repos/topics';
import type { PaperType, PersonLinks } from '@/db/types';
import { normalizeName } from '@/domain/match';
import { resolveDid } from '@/sources/bluesky';
import { canonicalUrl, parsePaperLink } from '@/sources/links';

// Study packs: a ready-made topic with its goal, a course outline, papers in reading
// order and people to follow. They ship with the app in public/packs/.

export type PackInfo = { id: string; title: string; description: string };

export type Pack = {
  id: string;
  title: string;
  // A pack may only bring people (e.g. voices outside academia).
  topic?: { name: string; color: string; keywords: string; goal: string };
  lessons?: { title: string; outline: string }[];
  papers?: { title: string; authors: string; year: number; url: string; type: PaperType; why?: string }[];
  // People with OpenAlex ids or links are followed; the others are suggestions.
  people: {
    name: string;
    why: string;
    openalexIds?: string[];
    orcid?: string;
    institution?: string;
    links?: PersonLinks;
  }[];
};

const BASE = process.env.EXPO_BASE_URL ?? '';

export async function listPacks(): Promise<PackInfo[]> {
  const res = await fetch(`${BASE}/packs/index.json`);
  if (!res.ok) throw new Error(`packs ${res.status}`);
  return (await res.json()) as PackInfo[];
}

export async function loadPack(id: string): Promise<Pack> {
  const res = await fetch(`${BASE}/packs/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`pack ${res.status}`);
  return (await res.json()) as Pack;
}

export type PackResult = { topicId: number | null; lessons: number; papers: number; people: number };

// Adds a pack without touching anything that is already there: an existing topic of
// the same name is reused, known papers and people are skipped. The pack's papers go
// to the front of the queue, and its course gets the daily lessons.
export async function importPack(db: Db, pack: Pack): Promise<PackResult> {
  const { topicId, lessons, papers } = pack.topic ? await importTopic(db, pack) : { topicId: null, lessons: 0, papers: 0 };
  const people = await importPeople(db, pack, topicId);
  const settings = await getSettings(db);
  if (topicId !== null) await setSetting(db, 'focusTopicId', topicId);
  if (!settings.packs.includes(pack.id)) await setSetting(db, 'packs', [...settings.packs, pack.id]);
  return { topicId, lessons, papers, people };
}

async function importTopic(db: Db, pack: Pack) {
  const topic = pack.topic!;
  const topics = await listTopics(db);
  const existing = topics.find((t) => t.name.trim().toLowerCase() === topic.name.trim().toLowerCase());
  let topicId: number;
  if (existing) {
    topicId = existing.id;
    await updateTopic(db, {
      ...existing,
      keywords: existing.keywords || topic.keywords,
      goal: existing.goal || topic.goal,
    });
  } else {
    topicId = await addTopic(db, topic);
  }

  // Sessions follow a reading path, planned at the first session; the pack's papers
  // are in the library and become candidates for it.
  const lessons = 0;

  const fresh = [];
  for (const p of pack.papers ?? []) {
    const url = canonicalUrl(parsePaperLink(p.url));
    if (!(await findPaperByUrl(db, url))) fresh.push({ ...p, url });
  }
  const first = (await frontPosition(db)) - fresh.length + 1;
  for (const [i, p] of fresh.entries()) {
    await addPaper(
      db,
      { title: p.title, authors: p.authors, year: p.year, url: p.url, topicId, type: p.type, note: p.why ?? '' },
      first + i
    );
  }

  return { topicId, lessons, papers: fresh.length };
}

async function importPeople(db: Db, pack: Pack, topicId: number | null) {
  const people = await listPeople(db);
  let followed = 0;
  for (const p of pack.people.filter((x) => x.openalexIds?.length || x.links)) {
    const known = people.some(
      (q) =>
        q.openalexIds.some((id) => (p.openalexIds ?? []).includes(id)) ||
        normalizeName(q.name) === normalizeName(p.name)
    );
    if (known) continue;
    await addPerson(
      db,
      newPerson({
        name: p.name,
        institution: p.institution ?? '',
        topicIds: topicId !== null ? [topicId] : [],
        links: p.links ?? {},
        openalexIds: p.openalexIds ?? [],
        orcid: p.orcid ?? null,
        // The permanent Bluesky id survives handle changes.
        blueskyDid: p.links?.bluesky ? await resolveDid(p.links.bluesky) : null,
        checkedAt: new Date().toISOString(),
      })
    );
    followed += 1;
  }
  return followed;
}
