/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { freshDb } from '../test/memory-db';

test('kept notes from a feed paper save the paper and link to it and its topic', async () => {
  const { keepNotes } = await import('./brain');
  const { listNotes } = await import('../db/repos/notes');
  const { listQueued } = await import('../db/repos/papers');
  const db = await freshDb();
  const ids = await keepNotes(
    db,
    {
      kind: 'paper',
      title: 'Sparse MRI',
      text: 'abstract',
      feedPaper: {
        id: 'x',
        title: 'Sparse MRI',
        authors: 'Lustig',
        year: 2007,
        date: '2007-12-01',
        url: 'https://doi.org/10.1002/mrm.21391',
        abstract: 'abstract',
        venue: 'MRM',
        topicId: 1,
      },
    },
    [
      { title: 'Sparsity lets MRI skip samples', body: 'Body one.' },
      { title: 'Incoherent aliasing looks like noise', body: 'Body two.' },
    ]
  );
  assert.equal(ids.length, 2);
  const paper = (await listQueued(db)).find((p) => p.title === 'Sparse MRI')!;
  const notes = await listNotes(db);
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => n.paperId === paper.id && n.topicIds.includes(1)));
});

test('notes from a web item keep the link in the body', async () => {
  const { keepNotes } = await import('./brain');
  const { listNotes } = await import('../db/repos/notes');
  const db = await freshDb();
  await keepNotes(db, { kind: 'Hacker News', title: 'T', text: 't', url: 'https://example.org/a' }, [
    { title: 'Idea', body: 'Body.' },
  ]);
  const [n] = await listNotes(db);
  assert.equal(n.paperId, null);
  assert.match(n.body, /Source: https:\/\/example.org\/a$/);
});

test('a session becomes source text with explorations and marks the paper read when kept', async () => {
  const { keepNotes, lessonSource } = await import('./brain');
  const { addToPath, getLesson, saveLessonContent } = await import('../db/repos/lessons');
  const { listArchive } = await import('../db/repos/papers');
  const db = await freshDb();
  await addToPath(db, 1, [{ title: 'SENSE', url: 'https://doi.org/10.1/s', meta: { year: 1999 } }]);
  await saveLessonContent(db, 1, { body: 'Explained', keyPoints: ['coil maps'], quiz: { question: 'q', options: ['a'], answer: 0 } } as never);
  const root = (await getLesson(db, 1))!;
  const s = lessonSource([root, { ...root, id: 2, kind: 'question', title: 'Why g-factor?', content: { ...root.content!, body: 'Because.' } }]);
  assert.match(s.text, /Explained[\s\S]*- coil maps[\s\S]*Question: Why g-factor\?\nBecause\./);
  await keepNotes(db, s, [{ title: 'Coil maps unfold aliasing', body: 'b' }]);
  assert.equal((await listArchive(db))[0].title, 'SENSE');
});
