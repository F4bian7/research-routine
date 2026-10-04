import type { Db } from '@/db/db';

import { seedIfEmpty } from './seed';

// Each entry upgrades the schema by one version. Append, never edit an old entry.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    topic_ids TEXT NOT NULL DEFAULT '[]',
    links TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '',
    year INTEGER,
    url TEXT NOT NULL DEFAULT '',
    topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'queued',
    rating TEXT,
    note TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL,
    read_at TEXT,
    position INTEGER NOT NULL
  );
  CREATE INDEX papers_queue ON papers(status, position);
  CREATE TABLE day_tasks (
    weekday INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    kind TEXT NOT NULL DEFAULT 'custom'
  );
  CREATE TABLE completions (
    date TEXT PRIMARY KEY,
    task_title TEXT NOT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE summaries (
    paper_id INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

export async function migrateAndSeed(db: Db) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  await seedIfEmpty(db);
}
