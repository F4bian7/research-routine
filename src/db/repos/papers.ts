import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Paper, PaperStatus, PaperType, Rating } from '../types';

type Row = {
  id: number;
  title: string;
  authors: string;
  year: number | null;
  url: string;
  topic_id: number | null;
  type: string;
  status: string;
  rating: string | null;
  note: string;
  added_at: string;
  read_at: string | null;
  position: number;
};

function fromRow(r: Row): Paper {
  return {
    id: r.id,
    title: r.title,
    authors: r.authors,
    year: r.year,
    url: r.url,
    topicId: r.topic_id,
    type: r.type as PaperType,
    status: r.status as PaperStatus,
    rating: r.rating as Rating,
    note: r.note,
    addedAt: r.added_at,
    readAt: r.read_at,
    position: r.position,
  };
}

// The item at the head of the queue, optionally restricted to some paper types.
export async function topQueued(
  db: Db,
  types?: PaperType[]
): Promise<Paper | null> {
  const filter = types?.length ? `AND type IN (${types.map(() => '?').join(', ')})` : '';
  const row = await db.getFirstAsync<Row>(
    `SELECT * FROM papers WHERE status = 'queued' ${filter} ORDER BY position LIMIT 1`,
    ...(types ?? [])
  );
  return row ? fromRow(row) : null;
}

export async function getPaper(db: Db, id: number): Promise<Paper | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM papers WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

// Queue in reading order, optionally for one topic.
export async function listQueued(db: Db, topicId?: number | null): Promise<Paper[]> {
  const rows = topicId
    ? await db.getAllAsync<Row>(
        "SELECT * FROM papers WHERE status = 'queued' AND topic_id = ? ORDER BY position",
        topicId
      )
    : await db.getAllAsync<Row>("SELECT * FROM papers WHERE status = 'queued' ORDER BY position");
  return rows.map(fromRow);
}

// Read papers, newest first; `search` matches title, authors and note.
export async function listArchive(db: Db, search = ''): Promise<Paper[]> {
  const q = `%${search.trim()}%`;
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM papers WHERE status = 'read'
     AND (title LIKE ? OR authors LIKE ? OR note LIKE ?)
     ORDER BY read_at DESC`,
    q,
    q,
    q
  );
  return rows.map(fromRow);
}

async function nextPosition(db: Db) {
  const row = await db.getFirstAsync<{ p: number | null }>('SELECT MAX(position) AS p FROM papers');
  return (row?.p ?? 0) + 1;
}

export type NewPaper = Pick<Paper, 'title' | 'url' | 'topicId' | 'type'> &
  Partial<Pick<Paper, 'authors' | 'year' | 'note'>>;

// New papers go to the end of the queue.
export async function addPaper(db: Db, p: NewPaper): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO papers (title, authors, year, url, topic_id, type, status, note, added_at, position)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    p.title,
    p.authors ?? '',
    p.year ?? null,
    p.url,
    p.topicId,
    p.type,
    p.note ?? '',
    new Date().toISOString(),
    await nextPosition(db)
  );
  notifyChange();
  return r.lastInsertRowId;
}

export type PaperEdit = Partial<
  Pick<Paper, 'title' | 'authors' | 'year' | 'url' | 'topicId' | 'type' | 'note' | 'rating'>
>;

const COLUMN: Record<keyof PaperEdit, string> = {
  title: 'title',
  authors: 'authors',
  year: 'year',
  url: 'url',
  topicId: 'topic_id',
  type: 'type',
  note: 'note',
  rating: 'rating',
};

export async function updatePaper(db: Db, id: number, edit: PaperEdit) {
  const keys = Object.keys(edit) as (keyof PaperEdit)[];
  if (keys.length === 0) return;
  await db.runAsync(
    `UPDATE papers SET ${keys.map((k) => `${COLUMN[k]} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map((k) => edit[k] ?? null),
    id
  );
  notifyChange();
}

export async function markRead(db: Db, id: number) {
  await db.runAsync(
    "UPDATE papers SET status = 'read', read_at = ? WHERE id = ?",
    new Date().toISOString(),
    id
  );
  notifyChange();
}

// "Später": to the end of the queue.
export async function postpone(db: Db, id: number) {
  await db.runAsync('UPDATE papers SET position = ? WHERE id = ?', await nextPosition(db), id);
  notifyChange();
}

// From the archive back to the end of the queue.
export async function requeue(db: Db, id: number) {
  await db.runAsync(
    "UPDATE papers SET status = 'queued', read_at = NULL, position = ? WHERE id = ?",
    await nextPosition(db),
    id
  );
  notifyChange();
}

export async function deletePaper(db: Db, id: number) {
  await db.runAsync('DELETE FROM papers WHERE id = ?', id);
  notifyChange();
}
