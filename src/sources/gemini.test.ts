/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { _parseSummaryForTests, extractJson } from './gemini';

const parse = (t: string) => _parseSummaryForTests(extractJson(t));

test('summary JSON, also inside a code fence, with junk terms dropped', () => {
  const s = parse(
    '```json\n{"short":" Kurz. ","problem":"P","method":"M","result":"R","relevance":"W","limits":"",' +
      '"terms":[{"term":"Dice","explanation":"Überlappungsmaß."},{"term":"","explanation":"x"}]}\n```'
  );
  assert.equal(s.short, 'Kurz.');
  assert.equal(s.limits, '');
  assert.deepEqual(s.terms, [{ term: 'Dice', explanation: 'Überlappungsmaß.' }]);
});

test('missing fields become empty', () => {
  const s = parse('{"short":"x"}');
  assert.equal(s.method, '');
  assert.deepEqual(s.terms, []);
});

test('JSON is found in chatty answers', () => {
  assert.equal(extractJson('Here you go:\n{"a": 1}\nThanks'), '{"a": 1}');
  assert.equal(extractJson('[{"x":1}]'), '[{"x":1}]');
});

test('a model without free quota is replaced by one that works, and remembered', async () => {
  const { generateJson } = await import('./gemini');
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.includes('?pageSize')) {
      return json(200, {
        models: [
          { name: 'models/gemini-9-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9-flash-tts', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      });
    }
    const model = decodeURIComponent(u.split('/models/')[1].split(':')[0]);
    asked.push(model);
    if (model === 'gemini-flash-latest') {
      return json(429, { error: { message: 'Quota exceeded for metric ... limit: 0, model: x' } });
    }
    return json(200, {
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok": true}' }] } }],
    });
  }) as typeof fetch;
  try {
    let saved = '';
    const out = await generateJson(
      { apiKey: 'k', model: 'gemini-flash-latest', onModel: (m) => (saved = m) },
      'i',
      'x',
      (t) => JSON.parse(t) as { ok: boolean }
    );
    assert.deepEqual(out, { ok: true });
    assert.deepEqual(asked, ['gemini-flash-latest', 'gemini-9-flash']);
    assert.equal(saved, 'gemini-9-flash');
  } finally {
    globalThis.fetch = real;
  }
});

test('a wrong key is reported, not retried', async () => {
  const { generateJson, explainError } = await import('./gemini');
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), {
      status: 400,
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      generateJson({ apiKey: 'bad', model: 'm' }, 'i', 'x', (t) => t),
      (e: unknown) => /not valid/.test(explainError(e))
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = real;
  }
});

test('a model out of daily quota hands over to its fallback without being replaced', async () => {
  const { generateJson } = await import('./gemini');
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const model = decodeURIComponent(String(url).split('/models/')[1].split(':')[0]);
    asked.push(model);
    if (model === 'strong-flash') {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded for metric requests per day, limit: 20' } }), {
        status: 429,
      });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
  }) as typeof fetch;
  try {
    let replaced = '';
    let used = '';
    const g = { apiKey: 'k', model: 'strong-flash', fallbacks: ['lite'], onModel: (m: string) => (replaced = m), onUsed: (m: string) => (used = m) };
    await generateJson(g, 'i', 'x', (t) => JSON.parse(t));
    assert.equal(used, 'lite');
    assert.equal(replaced, ''); // tomorrow the strong model has quota again
    await generateJson(g, 'i', 'x', (t) => JSON.parse(t));
    assert.deepEqual(asked, ['strong-flash', 'lite', 'lite']); // exhausted model skipped for now
  } finally {
    globalThis.fetch = real;
  }
});
