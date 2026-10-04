/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeStreak, makeCountsRule } from './streak';

// Mon-Fri enabled, weekend enabled but does not count by default.
const enabled = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
const workdays = makeCountsRule(enabled, false);
const everyDay = makeCountsRule(enabled, true);

// 2026-10-05 is a Monday.
const MON = '2026-10-05';

test('empty history is 0', () => {
  assert.equal(computeStreak(new Set(), workdays, MON), 0);
});

test('today not done yet keeps yesterday streak', () => {
  const done = new Set(['2026-10-01', '2026-10-02']); // Thu, Fri
  assert.equal(computeStreak(done, workdays, MON), 2); // weekend skipped
});

test('today done adds one', () => {
  const done = new Set(['2026-10-01', '2026-10-02', MON]);
  assert.equal(computeStreak(done, workdays, MON), 3);
});

test('missed workday breaks', () => {
  const done = new Set(['2026-09-30', '2026-10-02']); // Wed, Fri; Thu missed
  assert.equal(computeStreak(done, workdays, MON), 1);
});

test('weekend completion is a bonus, not required', () => {
  const done = new Set(['2026-10-02', '2026-10-03']); // Fri, Sat
  assert.equal(computeStreak(done, workdays, MON), 2);
});

test('weekend counts when enabled', () => {
  const done = new Set(['2026-10-02']); // Fri only, Sat/Sun missed
  assert.equal(computeStreak(done, everyDay, MON), 0);
});

test('disabled workday does not break', () => {
  const noWed = makeCountsRule({ ...enabled, 3: false }, false);
  const done = new Set(['2026-09-29', '2026-10-01']); // Tue, Thu; Wed off
  assert.equal(computeStreak(done, noWed, '2026-10-01'), 2);
});

test('yesterday missed and today open is 0', () => {
  const done = new Set(['2026-10-01']); // Thu; Fri missed
  assert.equal(computeStreak(done, workdays, MON), 0);
});
