import type { Db } from '@/db/db';
import { listArchive, listQueued } from '@/db/repos/papers';
import { listTopics } from '@/db/repos/topics';
import { type Brief, type BriefInput, explainMore, writeBriefs } from '@/sources/briefs';
import { getGemini } from './learn';

const CHUNK = 20;

// What Gemini should know about the reader: topics, goals, and papers they chose.
export async function readerProfile(db: Db): Promise<string> {
  const [topics, queued, read] = await Promise.all([listTopics(db), listQueued(db), listArchive(db)]);
  const liked = [...read.filter((p) => p.rating === 'up'), ...queued]
    .slice(0, 12)
    .map((p) => `- ${p.title}`);
  return [
    'Biomedical engineering student (medical image analysis with deep learning, EEG, MRI).',
    ...topics.map((t) => `Topic: ${t.name}${t.goal ? `. Goal: ${t.goal}` : ''}`),
    liked.length ? `Papers they chose to read:\n${liked.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function getBriefs(db: Db, ids: string[]): Promise<Map<string, Brief>> {
  if (ids.length === 0) return new Map();
  const rows = await db.getAllAsync<{ id: string; json: string }>(
    `SELECT id, json FROM briefs WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids
  );
  return new Map(rows.map((r) => [r.id, JSON.parse(r.json) as Brief]));
}

async function saveBrief(db: Db, id: string, b: Brief) {
  await db.runAsync(
    'INSERT OR REPLACE INTO briefs (id, json, created_at) VALUES (?, ?, ?)',
    id,
    JSON.stringify(b),
    new Date().toISOString()
  );
}

// Briefs for all items, asking Gemini only for those not written yet. Returns what is
// known; failures leave items without a brief. Saved without a change notice, so the
// screen that asked keeps its own state and nothing reloads.
export async function ensureBriefs(db: Db, items: BriefInput[]): Promise<Map<string, Brief>> {
  const known = await getBriefs(db, items.map((i) => i.id));
  const missing = items.filter((i) => !known.has(i.id));
  const g = missing.length ? await getGemini(db, 'fast') : null;
  if (!g) return known;
  const profile = await readerProfile(db);
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const got = await writeBriefs(g, profile, chunk);
    for (const [id, b] of got) {
      known.set(id, b);
      await saveBrief(db, id, b);
    }
  }
  return known;
}

export async function moreAbout(db: Db, item: BriefInput, brief: Brief | undefined): Promise<Brief> {
  const g = await getGemini(db, 'fast');
  if (!g) throw new Error('no key');
  const text = await explainMore(g, await readerProfile(db), item);
  const next = { ...(brief ?? { score: 3, gist: '', why: '' }), more: text };
  await saveBrief(db, item.id, next);
  return next;
}
