/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { repairJsonEscapes, repairLatex, splitMath } from './math';

test('inline and display formulas are found', () => {
  assert.deepEqual(splitMath('Signal $S = M_0 e^{-t/T_2}$ decays.\n$$\\omega = \\gamma B_0$$'), [
    { text: 'Signal ' },
    { math: 'S = M_0 e^{-t/T_2}', display: false },
    { text: ' decays.\n' },
    { math: '\\omega = \\gamma B_0', display: true },
  ]);
  assert.deepEqual(splitMath('with \\(k_x\\) and \\[x^2\\]'), [
    { text: 'with ' },
    { math: 'k_x', display: false },
    { text: ' and ' },
    { math: 'x^2', display: true },
  ]);
});

test('money is not maths', () => {
  assert.deepEqual(splitMath('It costs $5 and $10 today'), [{ text: 'It costs $5 and $10 today' }]);
});

test('backslashes lost to JSON escapes come back', () => {
  assert.equal(repairLatex('\frac{a}{b} + \theta + \beta'), '\\frac{a}{b} + \\theta + \\beta');
  const broken = '{"body": "Use $\\alpha + \\sum_i x_i$"}';
  assert.equal(JSON.parse(repairJsonEscapes(broken)).body, 'Use $\\alpha + \\sum_i x_i$');
});
