/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { _parseCardListForTests as parseCardList, parseLesson, parseSyllabus } from './learning';

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

test('loose shapes from the model are accepted', () => {
  assert.equal(parseSyllabus('[{"title":"A"}]').length, 1);
  assert.deepEqual(parseCardList('{"flashcards":[{"question":"Q","answer":"A"}]}'), [{ front: 'Q', back: 'A' }]);
  assert.deepEqual(parseCardList('[{"front":"F","back":"B"}]'), [{ front: 'F', back: 'B' }]);
  const l = parseLesson(JSON.stringify({ body: 'x', quiz: { question: 'Q', choices: ['a', 'b', 'c'], correct: 'B' } }));
  assert.equal(l.quiz.answer, 1);
  const l2 = parseLesson(JSON.stringify({ body: 'x', quiz: { question: 'Q', options: ['a', 'b'], answer: 'b' } }));
  assert.equal(l2.quiz.answer, 1);
});

test('a lesson brings checks and places to go next', () => {
  const l = parseLesson(
    JSON.stringify({
      body: '## Intuition\nText',
      checks: [
        { question: 'Q1', options: ['a', 'b'], answer: 1 },
        { question: 'broken', options: ['a'], answer: 3 },
      ],
      deeper: [{ title: 'Coil sensitivities', why: 'W' }, 'g-factor', { why: 'no title' }],
      broader: [{ title: 'Compressed sensing' }],
    })
  );
  assert.equal(l.checks!.length, 1);
  assert.equal(l.quiz.question, 'Q1');
  assert.deepEqual(l.deeper!.map((d) => d.title), ['Coil sensitivities', 'g-factor']);
  assert.equal(l.broader![0].why, '');
});
