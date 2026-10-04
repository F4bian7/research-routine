/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { freshDb } from '../test/memory-db';

test('export then import restores every table, without the API key', async () => {
  const { exportBackup, importBackup } = await import('./backup');
  const { addPaper, markRead, updatePaper } = await import('../db/repos/papers');
  const { markDone } = await import('../db/repos/completions');
  const { setSetting } = await import('../db/repos/settings');
  const { saveSummary } = await import('../db/repos/summaries');
  const { setFeedDecision } = await import('../db/repos/feed');

  const a = await freshDb();
  const id = await addPaper(a, { title: 'Ümlaut "quote"', url: 'https://x.org', topicId: 1, type: 'survey' });
  await updatePaper(a, id, { note: 'line1\nline2', rating: 'up' });
  await markRead(a, 1);
  await markDone(a, '2026-10-03', 'Free day');
  await setSetting(a, 'weekendCounts', true);
  await setSetting(a, 'geminiApiKey', 'SECRET');
  await saveSummary(a, id, { short: 's', problem: '', method: '', result: '', relevance: '', limits: '', terms: [] }, 'm');
  await setFeedDecision(a, 'arxiv:1', 'down');
  const { addNote } = await import('../db/repos/notes');
  const { addCards } = await import('../db/repos/cards');
  const { addSyllabus } = await import('../db/repos/lessons');
  const { logLearning, setRoutineDone } = await import('../db/repos/learn');
  const noteId = await addNote(a, { title: 'Idea', body: 'see [[Other]]', quote: 'q', paperId: id, topicIds: [1], personIds: [] });
  await addSyllabus(a, 1, [{ title: 'L1', outline: 'o' }]);
  await addCards(a, [{ front: 'F', back: 'B', source: 'note', status: 'active', noteId, topicId: 1 }]);
  await logLearning(a, '2026-10-03', 12, 3, null);
  await setRoutineDone(a, '2026-10-03', true);

  const backup = await exportBackup(a);
  const text = JSON.stringify(backup);
  assert.doesNotMatch(text, /SECRET/);

  const b = await freshDb();
  await setSetting(b, 'geminiApiKey', 'KEEP');
  await importBackup(b, JSON.parse(text));

  const again = await exportBackup(b);
  assert.deepEqual(again.tables, backup.tables);
  const key = await b.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'geminiApiKey'");
  assert.equal(key?.value, '"KEEP"');
});

test('a foreign file is rejected and nothing changes', async () => {
  const { exportBackup, importBackup, BackupError } = await import('./backup');
  const db = await freshDb();
  const before = await exportBackup(db);
  await assert.rejects(importBackup(db, { hello: 1 }), BackupError);
  assert.deepEqual((await exportBackup(db)).tables, before.tables);
});
