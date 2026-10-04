/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { freshDb } from '../test/memory-db';

test('briefs are written once per item, in chunks, and reused', async () => {
  const { ensureBriefs } = await import('./briefs');
  const { setSetting } = await import('../db/repos/settings');
  const db = await freshDb();
  await setSetting(db, 'geminiApiKey', 'k');
  await setSetting(db, 'geminiModel', 'm');

  const prompts: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string, o: RequestInit) => {
    const body = JSON.parse(String(o.body));
    const input: string = body.contents[0].parts[0].text;
    prompts.push(body.systemInstruction.parts[0].text);
    const ids = [...input.matchAll(/\[id: ([^\]]+)\]/g)].map((m) => m[1]);
    const items = ids.map((id) => ({ id, score: id === 'x3' ? 5 : 2, gist: `plain ${id}`, why: 'w' }));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] }));
  }) as typeof fetch;
  try {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: `x${i}`, kind: 'paper', text: `T${i}` }));
    const first = await ensureBriefs(db, items);
    assert.equal(first.size, 25);
    assert.equal(prompts.length, 2); // 20 + 5
    assert.match(prompts[0], /Biomedical engineering student/);
    assert.equal(first.get('x3')!.score, 5);
    const again = await ensureBriefs(db, items);
    assert.equal(again.size, 25);
    assert.equal(prompts.length, 2); // nothing new asked
  } finally {
    globalThis.fetch = real;
  }
});

test('items are ordered by score for "For you"', async () => {
  const { byScore } = await import('./use-briefs');
  const briefs = new Map([
    ['a', { score: 2, gist: '', why: '' }],
    ['c', { score: 5, gist: '', why: '' }],
  ]);
  assert.deepEqual(byScore(['a', 'b', 'c'], (x) => x, briefs), ['c', 'a', 'b']);
});
