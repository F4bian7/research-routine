import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { SrsState } from '@/domain/srs';
import type { Card, CardSource, CardStatus } from '../types';

type Row = {
  id: number;
  front: string;
  back: string;
  source: string;
  note_id: number | null;
  paper_id: number | null;
  lesson_id: number | null;
  topic_id: number | null;
  status: string;
  due: string | null;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  created_at: string;
};

function fromRow(r: Row): Card {
  return {
    id: r.id,
    front: r.front,
    back: r.back,
    source: r.source as CardSource,
    noteId: r.note_id,
    paperId: r.paper_id,
    lessonId: r.lesson_id,
    topicId: r.topic_id,
    status: r.status as CardStatus,
    due: r.due,
    intervalDays: r.interval_days,
    ease: r.ease,
    reps: r.reps,
    lapses: r.lapses,
    lastReview: r.last_review,
    createdAt: r.created_at,
  };
}

export type NewCard = {
  front: string;
  back: string;
  source: CardSource;
  status: CardStatus;
  noteId?: number | null;
  paperId?: number | null;
  lessonId?: number | null;
  topicId?: number | null;
};

export async function addCards(db: Db, cards: NewCard[]) {
  const now = new Date().toISOString();
  for (const c of cards) {
    await db.runAsync(
      `INSERT INTO cards (front, back, source, status, note_id, paper_id, lesson_id, topic_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c.front,
      c.back,
      c.source,
      c.status,
      c.noteId ?? null,
      c.paperId ?? null,
      c.lessonId ?? null,
      c.topicId ?? null,
      now
    );
  }
  notifyChange();
}

export async function listCards(db: Db, status?: CardStatus): Promise<Card[]> {
  const rows = status
    ? await db.getAllAsync<Row>('SELECT * FROM cards WHERE status = ? ORDER BY created_at DESC', status)
    : await db.getAllAsync<Row>('SELECT * FROM cards ORDER BY created_at DESC');
  return rows.map(fromRow);
}

export async function cardsFor(db: Db, field: 'paper_id' | 'note_id', id: number): Promise<Card[]> {
  const rows = await db.getAllAsync<Row>(`SELECT * FROM cards WHERE ${field} = ? ORDER BY id`, id);
  return rows.map(fromRow);
}

// Active cards due today or earlier, oldest due first.
export async function dueCards(db: Db, today: string, limit: number): Promise<Card[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM cards WHERE status = 'active' AND due IS NOT NULL AND due <= ?
     ORDER BY due, id LIMIT ?`,
    today,
    limit
  );
  return rows.map(fromRow);
}

// Active cards never reviewed, oldest first.
export async function newCards(db: Db, limit: number): Promise<Card[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM cards WHERE status = 'active' AND due IS NULL ORDER BY id LIMIT ?`,
    limit
  );
  return rows.map(fromRow);
}

export async function saveReview(db: Db, id: number, s: SrsState) {
  await db.runAsync(
    `UPDATE cards SET due = ?, interval_days = ?, ease = ?, reps = ?, lapses = ?, last_review = ?
     WHERE id = ?`,
    s.due,
    s.intervalDays,
    s.ease,
    s.reps,
    s.lapses,
    new Date().toISOString(),
    id
  );
  // No notifyChange: the session screen keeps its own queue while it runs.
}

export async function updateCard(db: Db, id: number, edit: { front?: string; back?: string; status?: CardStatus }) {
  const card = await db.getFirstAsync<Row>('SELECT * FROM cards WHERE id = ?', id);
  if (!card) return;
  await db.runAsync(
    'UPDATE cards SET front = ?, back = ?, status = ? WHERE id = ?',
    edit.front ?? card.front,
    edit.back ?? card.back,
    edit.status ?? card.status,
    id
  );
  notifyChange();
}

export async function deleteCard(db: Db, id: number) {
  await db.runAsync('DELETE FROM cards WHERE id = ?', id);
  notifyChange();
}

export async function cardCounts(db: Db, today: string) {
  const row = await db.getFirstAsync<{ active: number; due: number; suggested: number; fresh: number }>(
    `SELECT
       SUM(status = 'active') AS active,
       SUM(status = 'active' AND due IS NOT NULL AND due <= ?) AS due,
       SUM(status = 'suggested') AS suggested,
       SUM(status = 'active' AND due IS NULL) AS fresh
     FROM cards`,
    today
  );
  return {
    active: row?.active ?? 0,
    due: row?.due ?? 0,
    suggested: row?.suggested ?? 0,
    fresh: row?.fresh ?? 0,
  };
}

export async function getCard(db: Db, id: number): Promise<Card | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM cards WHERE id = ?', id);
  return row ? fromRow(row) : null;
}
