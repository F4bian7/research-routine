import type { Db } from '@/db/db';
import { listLessons, addSyllabus } from '@/db/repos/lessons';
import { addPaper, findPaperByUrl, frontPosition } from '@/db/repos/papers';
import { addPerson, listPeople, newPerson } from '@/db/repos/people';
import { getSettings, setSetting } from '@/db/repos/settings';
import { addTopic, listTopics, updateTopic } from '@/db/repos/topics';
import type { PaperType } from '@/db/types';
import { normalizeName } from '@/domain/match';
import { canonicalUrl, parsePaperLink } from '@/sources/links';

// Study packs: a ready-made topic with its goal, a course outline, papers in reading
// order and people to follow. They ship with the app in public/packs/.

export type PackInfo = { id: string; title: string; description: string };

export type Pack = {
  id: string;
  title: string;
  topic: { name: string; color: string; keywords: string; goal: string };
  lessons: { title: string; outline: string }[];
  papers: { title: string; authors: string; year: number; url: string; type: PaperType; why?: string }[];
  people: { name: string; why: string; openalexIds?: string[]; orcid?: string; institution?: string }[];
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

export type PackResult = { topicId: number; lessons: number; papers: number; people: number };

// Adds a pack without touching anything that is already there: an existing topic of
// the same name is reused, known papers and people are skipped. The pack's papers go
// to the front of the queue, and its course gets the daily lessons.
export async function importPack(db: Db, pack: Pack): Promise<PackResult> {
  const topics = await listTopics(db);
  const existing = topics.find((t) => t.name.trim().toLowerCase() === pack.topic.name.trim().toLowerCase());
  let topicId: number;
  if (existing) {
    topicId = existing.id;
    await updateTopic(db, {
      ...existing,
      keywords: existing.keywords || pack.topic.keywords,
      goal: existing.goal || pack.topic.goal,
    });
  } else {
    topicId = await addTopic(db, pack.topic);
  }

  let lessons = 0;
  if ((await listLessons(db, topicId)).length === 0) {
    await addSyllabus(db, topicId, pack.lessons);
    lessons = pack.lessons.length;
  }

  const fresh = [];
  for (const p of pack.papers) {
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

  const people = await listPeople(db);
  let followed = 0;
  for (const p of pack.people.filter((x) => x.openalexIds?.length)) {
    const known = people.some(
      (q) => q.openalexIds.some((id) => p.openalexIds!.includes(id)) || normalizeName(q.name) === normalizeName(p.name)
    );
    if (known) continue;
    await addPerson(
      db,
      newPerson({
        name: p.name,
        institution: p.institution ?? '',
        topicIds: [topicId],
        openalexIds: p.openalexIds,
        orcid: p.orcid ?? null,
        checkedAt: new Date().toISOString(),
      })
    );
    followed += 1;
  }

  const settings = await getSettings(db);
  await setSetting(db, 'focusTopicId', topicId);
  if (!settings.packs.includes(pack.id)) await setSetting(db, 'packs', [...settings.packs, pack.id]);
  return { topicId, lessons, papers: fresh.length, people: followed };
}
