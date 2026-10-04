/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parsePaperLink } from '../sources/links';
import { freshDb } from '../test/memory-db';

const pack = JSON.parse(readFileSync('public/packs/cardiac-mra-thesis.json', 'utf8'));

test('the thesis pack is well formed', () => {
  assert.ok(pack.lessons.length >= 20);
  for (const p of pack.papers) assert.notEqual(parsePaperLink(p.url).kind, 'url', p.title);
  const index = JSON.parse(readFileSync('public/packs/index.json', 'utf8'));
  assert.ok(index.some((i: { id: string }) => i.id === pack.id));
});

test('importing a pack adds topic, course, papers first, people, focus; twice changes nothing', async () => {
  const { importPack } = await import('./packs');
  const { listQueued } = await import('../db/repos/papers');
  const { listPeople } = await import('../db/repos/people');
  const { getSettings } = await import('../db/repos/settings');
  const { peekLesson } = await import('./learn');

  const db = await freshDb();
  const r = await importPack(db, pack);
  assert.equal(r.lessons, 0); // sessions follow a reading path planned later
  assert.equal(r.papers, pack.papers.length);
  assert.equal(r.people, 3);

  const queue = await listQueued(db);
  assert.equal(queue[0].title, pack.papers[0].title); // pack papers come first, in order
  assert.equal(queue[1].title, pack.papers[1].title);
  assert.equal((await getSettings(db)).focusTopicId, r.topicId);
  // The focused course provides the next lesson (as soon as Gemini can write it).
  assert.equal((await peekLesson(db, true)).topic?.id, r.topicId);

  const again = await importPack(db, pack);
  assert.deepEqual([again.lessons, again.papers, again.people], [0, 0, 0]);
  assert.equal((await listPeople(db)).length, 3);
});

test('a people-only pack follows voices with their links and no topic', async () => {
  const { importPack } = await import('./packs');
  const { listPeople } = await import('../db/repos/people');
  const { getSettings } = await import('../db/repos/settings');
  const voices = JSON.parse(readFileSync('public/packs/voices-ai.json', 'utf8'));
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ did: 'did:plc:test' }), { status: 200 })) as typeof fetch;
  try {
    const db = await freshDb();
    const r = await importPack(db, voices);
    assert.equal(r.topicId, null);
    assert.equal(r.people, voices.people.length);
    const karpathy = (await listPeople(db)).find((p) => p.name === 'Andrej Karpathy')!;
    assert.equal(karpathy.links.github, 'karpathy');
    assert.equal(karpathy.blueskyDid, 'did:plc:test');
    assert.equal((await getSettings(db)).focusTopicId, null);
  } finally {
    globalThis.fetch = real;
  }
});
