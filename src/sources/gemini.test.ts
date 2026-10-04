/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { _parseSummaryForTests as parse } from './gemini';

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
