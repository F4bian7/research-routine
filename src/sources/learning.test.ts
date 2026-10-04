/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseLesson, parseSyllabus } from './learning';

test('syllabus keeps lessons with a title', () => {
  const s = parseSyllabus('{"lessons":[{"title":"k-space","outline":"What it is"},{"title":""}]}');
  assert.deepEqual(s, [{ title: 'k-space', outline: 'What it is' }]);
  assert.throws(() => parseSyllabus('{"lessons":[]}'));
});

test('lesson with quiz and cards', () => {
  const l = parseLesson(
    JSON.stringify({
      body: 'Text.',
      keyPoints: ['a', ''],
      quiz: { question: 'Q?', options: ['x', 'y', 'z', 'w'], answer: '2', explanation: 'E' },
      cards: [{ front: 'F', back: 'B' }, { front: 'only front' }],
    })
  );
  assert.equal(l.quiz.answer, 2);
  assert.deepEqual(l.keyPoints, ['a']);
  assert.deepEqual(l.cards, [{ front: 'F', back: 'B' }]);
});

test('a quiz whose answer is out of range is rejected', () => {
  assert.throws(() =>
    parseLesson(JSON.stringify({ body: 'x', quiz: { question: 'Q', options: ['a', 'b'], answer: 5 } }))
  );
});
