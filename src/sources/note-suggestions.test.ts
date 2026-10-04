/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSuggestions } from './note-suggestions';

test('suggested notes need a title and a body', () => {
  const n = parseSuggestions(
    JSON.stringify({ notes: [{ title: 'Idea', body: 'Because [[Other]].' }, { title: 'No body' }] })
  );
  assert.deepEqual(n, [{ title: 'Idea', body: 'Because [[Other]].' }]);
  assert.throws(() => parseSuggestions('{"notes": []}'));
});
