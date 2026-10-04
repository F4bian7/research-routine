/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NEW_CARD, review } from './srs';

const T = '2026-10-05';

test('a new card answered "good" grows 1, 3, then by ease', () => {
  const a = review(NEW_CARD, 'good', T);
  assert.equal(a.due, '2026-10-06');
  const b = review(a, 'good', a.due!);
  assert.equal(b.intervalDays, 3);
  const c = review(b, 'good', b.due!);
  assert.equal(c.intervalDays, 8); // round(3 * 2.5)
  assert.equal(c.reps, 3);
});

test('"again" resets the run, counts a lapse and lowers ease', () => {
  const s = { due: T, intervalDays: 20, ease: 2.5, reps: 4, lapses: 0 };
  const r = review(s, 'again', T);
  assert.equal(r.intervalDays, 1);
  assert.equal(r.reps, 0);
  assert.equal(r.lapses, 1);
  assert.equal(r.ease, 2.3);
});

test('"easy" jumps further and ease never drops below 1.3', () => {
  assert.equal(review(NEW_CARD, 'easy', T).intervalDays, 3);
  let s = { ...NEW_CARD, ease: 1.35 };
  s = review(s, 'again', T);
  assert.equal(s.ease, 1.3);
});

test('"hard" still moves forward', () => {
  const s = { due: T, intervalDays: 10, ease: 2.5, reps: 3, lapses: 0 };
  assert.equal(review(s, 'hard', T).intervalDays, 12);
});
