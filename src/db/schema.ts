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
  // The app switched to English: translate seed rows the user has not changed.
  `
  UPDATE topics SET name = 'Medical image segmentation' WHERE name = 'Medizinische Bildsegmentierung';
  UPDATE topics SET name = 'EEG and seizure analysis' WHERE name = 'EEG und Seizure-Analyse';
  UPDATE topics SET name = 'MRI physics and reconstruction' WHERE name = 'MRT-Physik und Rekonstruktion';
  UPDATE day_tasks SET title = 'Go through new papers',
    description = 'Open Scholar Inbox and rate 2 to 3 new papers.'
    WHERE title = 'Neue Paper durchgehen';
  UPDATE day_tasks SET title = 'One paper from the backlog',
    description = 'Read the abstract, figures and conclusion.'
    WHERE title = '1 Paper aus dem Backlog';
  UPDATE day_tasks SET title = 'Skim the social feed',
    description = 'Scroll through the Bluesky and X lists.'
    WHERE title = 'Social-Feed überfliegen';
  UPDATE day_tasks SET title = 'New papers plus a survey',
    description = 'Go through new papers and start one survey or milestone paper.'
    WHERE title = 'Neue Paper plus Survey';
  UPDATE day_tasks SET title = 'Free day',
    description = 'Optional: trending papers on alphaXiv or Hugging Face Daily Papers.'
    WHERE title = 'Frei';
  UPDATE settings SET value = replace(replace(value, 'Bluesky-Liste', 'Bluesky list'), 'X-Liste', 'X list')
    WHERE key = 'quickLinks';
  `,
  // Feeds: search keywords per topic, and what the user did with feed items.
  `
  ALTER TABLE topics ADD COLUMN keywords TEXT NOT NULL DEFAULT '';
  UPDATE topics SET keywords = 'medical image segmentation, nnU-Net, "segment anything"'
    WHERE name = 'Medical image segmentation';
  UPDATE topics SET keywords = 'EEG seizure, EEG epilepsy, "seizure detection", EEG deep learning'
    WHERE name = 'EEG and seizure analysis';
  UPDATE topics SET keywords = 'MRI reconstruction, accelerated MRI, quantitative MRI, "MR fingerprinting"'
    WHERE name = 'MRI physics and reconstruction';
  CREATE TABLE feed_seen (
    id TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    at TEXT NOT NULL
  );
  `,
  // People: the matching OpenAlex author, for their recent papers inside the app.
  `
  ALTER TABLE people ADD COLUMN openalex_id TEXT;
  `,
  // People may have several OpenAlex profiles; ORCID and Bluesky DID keep them
  // findable when they move institution or change their handle.
  `
  ALTER TABLE people ADD COLUMN openalex_ids TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE people ADD COLUMN orcid TEXT;
  ALTER TABLE people ADD COLUMN bluesky_did TEXT;
  ALTER TABLE people ADD COLUMN openalex_ignored TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE people ADD COLUMN openalex_pending TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE people ADD COLUMN checked_at TEXT;
  UPDATE people SET openalex_ids = '["' || openalex_id || '"]' WHERE openalex_id IS NOT NULL;
  `,
  // Second brain and Learn. From here on "completions" are Learn sessions (they
  // carry the streak); the routine task of the day is ticked in routine_done.
  `
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    quote TEXT NOT NULL DEFAULT '',
    paper_id INTEGER REFERENCES papers(id) ON DELETE SET NULL,
    topic_ids TEXT NOT NULL DEFAULT '[]',
    person_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    outline TEXT NOT NULL DEFAULT '',
    content TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    done_at TEXT
  );
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source TEXT NOT NULL,
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
    topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    due TEXT,
    interval_days REAL NOT NULL DEFAULT 0,
    ease REAL NOT NULL DEFAULT 2.5,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_review TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX cards_due ON cards(status, due);
  CREATE TABLE learn_log (
    date TEXT PRIMARY KEY,
    xp INTEGER NOT NULL DEFAULT 0,
    reviewed INTEGER NOT NULL DEFAULT 0,
    lesson_id INTEGER
  );
  CREATE TABLE routine_done (
    date TEXT PRIMARY KEY
  );
  INSERT INTO routine_done (date) SELECT date FROM completions;
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
