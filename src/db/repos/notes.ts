import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Note } from '../types';

type Row = {
  id: number;
  title: string;
  body: string;
  quote: string;
  paper_id: number | null;
  topic_ids: string;
  person_ids: string;
  created_at: string;
  updated_at: string;
};

function fromRow(r: Row): Note {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    quote: r.quote,
    paperId: r.paper_id,
    topicIds: JSON.parse(r.topic_ids) as number[],
    personIds: JSON.parse(r.person_ids) as number[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listNotes(db: Db, search = ''): Promise<Note[]> {
  const q = `%${search.trim()}%`;
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM notes WHERE title LIKE ? OR body LIKE ? OR quote LIKE ?
     ORDER BY updated_at DESC`,
    q,
    q,
    q
  );
  return rows.map(fromRow);
}

export async function getNote(db: Db, id: number): Promise<Note | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM notes WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function notesForPaper(db: Db, paperId: number): Promise<Note[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM notes WHERE paper_id = ? ORDER BY created_at',
    paperId
  );
  return rows.map(fromRow);
}

export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export async function addNote(db: Db, n: NoteInput): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.runAsync(
    `INSERT INTO notes (title, body, quote, paper_id, topic_ids, person_ids, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    n.title,
    n.body,
    n.quote,
    n.paperId,
    JSON.stringify(n.topicIds),
    JSON.stringify(n.personIds),
    now,
    now
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function updateNote(db: Db, n: Note) {
  await db.runAsync(
    `UPDATE notes SET title = ?, body = ?, quote = ?, paper_id = ?, topic_ids = ?, person_ids = ?,
     updated_at = ? WHERE id = ?`,
    n.title,
    n.body,
    n.quote,
    n.paperId,
    JSON.stringify(n.topicIds),
    JSON.stringify(n.personIds),
    new Date().toISOString(),
    n.id
  );
  notifyChange();
}

export async function deleteNote(db: Db, id: number) {
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
  notifyChange();
}
