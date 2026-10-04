/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBriefs } from './briefs';

test('briefs are matched to known ids and scores are clamped', () => {
  const m = parseBriefs(
    JSON.stringify({
      items: [
        { id: 'a', score: 9, gist: 'A plain gist', why: 'W' },
        { id: 'b', score: '2', gist: 'B' },
        { id: 'zzz', score: 5, gist: 'unknown id' },
        { id: 'c', score: 4, gist: '' },
      ],
    }),
    ['a', 'b', 'c']
  );
  assert.deepEqual([...m.keys()], ['a', 'b']);
  assert.equal(m.get('a')!.score, 5);
  assert.equal(m.get('b')!.score, 2);
  assert.equal(m.get('b')!.why, '');
});
