/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import initSqlJs, { type Database } from 'sql.js';

import type { Db, SQLValue } from '../db/db';

// In-memory Db over sql.js, the same engine the web build uses.
function memoryDb(db: Database): Db {
  const query = <T>(sql: string, params: SQLValue[]) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  };
  const self: Db = {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, ...params) => {
      db.run(sql, params);
      const id = query<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0].id;
      return { lastInsertRowId: id, changes: db.getRowsModified() };
    },
    getFirstAsync: async <T,>(sql: string, ...params: SQLValue[]) => query<T>(sql, params)[0] ?? null,
    getAllAsync: async <T,>(sql: string, ...params: SQLValue[]) => query<T>(sql, params),
    withExclusiveTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task(self);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return self;
}

async function freshDb() {
  const SQL = await initSqlJs();
  const db = memoryDb(new SQL.Database());
  const { migrateAndSeed } = await import('../db/schema');
  await migrateAndSeed(db);
  return db;
}

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
