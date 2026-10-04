/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { freshDb } from '../test/memory-db';

test('cards for review, lessons finished, completion counts for the streak', async () => {
  const { completeSession, finishLesson, prepareLesson, sessionCards } = await import('./learn');
  const { addCards, saveReview } = await import('../db/repos/cards');
  const { addSyllabus, getLesson, saveLessonContent } = await import('../db/repos/lessons');
  const { listCompletions } = await import('../db/repos/completions');
  const { getLearnDay } = await import('../db/repos/learn');

  const db = await freshDb();
  await addCards(db, [
    { front: 'due', back: 'b', source: 'manual', status: 'active' },
    { front: 'later', back: 'b', source: 'manual', status: 'active' },
    { front: 'new', back: 'b', source: 'manual', status: 'active' },
    { front: 'suggested', back: 'b', source: 'paper', status: 'suggested' },
  ]);
  await saveReview(db, 1, { due: '2026-10-04', intervalDays: 3, ease: 2.5, reps: 2, lapses: 0 });
  await saveReview(db, 2, { due: '2026-10-20', intervalDays: 9, ease: 2.5, reps: 3, lapses: 0 });

  const cards = await sessionCards(db, '2026-10-05');
  assert.deepEqual(cards.map((c) => c.front), ['due', 'new']);

  // Without a Gemini key there is no lesson to prepare.
  assert.equal(await prepareLesson(db), null);

  await addSyllabus(db, 1, [{ title: 'k-space', outline: 'o' }]);
  const lesson = (await getLesson(db, 1))!;
  await saveLessonContent(db, lesson.id, {
    body: 'b',
    keyPoints: [],
    quiz: { question: 'q', options: ['a', 'b'], answer: 0, explanation: '' },
    cards: [{ front: 'What is k-space?', back: 'Fourier domain' }],
  });
  // A lesson already written is served even without a key.
  assert.equal((await prepareLesson(db))?.lesson.title, 'k-space');
  await finishLesson(db, (await getLesson(db, 1))!);
  assert.equal((await getLesson(db, 1))!.status, 'done');
  // Lessons teach; they no longer push flashcards into reviews.
  assert.ok(!(await sessionCards(db, '2026-10-05')).some((c) => c.front === 'What is k-space?'));

  await completeSession(db, '2026-10-05', { xp: 14, reviewed: 2, lessonId: 1 });
  assert.deepEqual((await listCompletions(db)).map((c) => c.date), ['2026-10-05']);
  assert.equal((await getLearnDay(db, '2026-10-05'))?.xp, 14);
});

test('quality work walks through the Flash models before Flash-Lite and Gemma', async () => {
  const { getGemini } = await import('./learn');
  const { setSetting } = await import('../db/repos/settings');
  const db = await freshDb();
  assert.equal(await getGemini(db), null);
  await setSetting(db, 'geminiApiKey', 'k');
  await setSetting(db, 'geminiModel', 'gemini-flash-latest'); // old alias in old settings
  const q = (await getGemini(db, 'quality'))!;
  assert.equal(q.model, 'gemini-3.8-flash');
  assert.deepEqual(q.fallbacks, [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemma:auto',
  ]);
  const f = (await getGemini(db, 'fast'))!;
  assert.equal(f.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(f.fallbacks, ['gemini-3.1-flash-lite', 'gemma:auto']);
});

test('explorations branch off a lesson and stay out of the course plan', async () => {
  const { exploreFrom } = await import('./learn');
  const { addSyllabus, getLesson, listExplorations, listLessons, saveLessonContent } = await import('../db/repos/lessons');
  const { setSetting } = await import('../db/repos/settings');
  const db = await freshDb();
  await setSetting(db, 'geminiApiKey', 'k');
  await addSyllabus(db, 1, [{ title: 'SENSE', outline: 'o' }, { title: 'GRAPPA', outline: 'o' }]);
  await saveLessonContent(db, 1, {
    body: 'b', keyPoints: ['coils'], quiz: { question: 'q', options: ['a', 'b'], answer: 0, explanation: '' }, cards: [],
  });
  const prompts: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string, o: RequestInit) => {
    prompts.push(JSON.parse(String(o.body)).systemInstruction.parts[0].text);
    const lesson = { body: 'Deeper text', keyPoints: ['k'], checks: [{ question: 'Q', options: ['a', 'b'], answer: 0 }], deeper: [{ title: 'More' }] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(lesson) }] } }] }));
  }) as typeof fetch;
  try {
    const root = (await getLesson(db, 1))!;
    const e1 = await exploreFrom(db, root, 'deeper', 'The g-factor');
    const e2 = await exploreFrom(db, root, 'question', 'Why do coils need calibration?');
    assert.equal(e1.kind, 'deeper');
    assert.equal(e1.title, 'The g-factor');
    assert.equal(e2.prompt, 'Why do coils need calibration?');
    assert.match(prompts[1], /Do not\s+repeat what these already covered: SENSE; The g-factor/);
    assert.deepEqual((await listExplorations(db, 1)).map((e) => e.id), [e1.id, e2.id]);
    assert.deepEqual((await listLessons(db, 1)).map((l) => l.title), ['SENSE', 'GRAPPA']);
  } finally {
    globalThis.fetch = real;
  }
});
