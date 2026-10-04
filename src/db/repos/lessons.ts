import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Lesson, LessonContent } from '../types';

type Row = {
  id: number;
  topic_id: number | null;
  position: number;
  title: string;
  outline: string;
  content: string | null;
  status: string;
  done_at: string | null;
};

function fromRow(r: Row): Lesson {
  return {
    id: r.id,
    topicId: r.topic_id,
    position: r.position,
    title: r.title,
    outline: r.outline,
    content: r.content ? (JSON.parse(r.content) as LessonContent) : null,
    status: r.status as Lesson['status'],
    doneAt: r.done_at,
  };
}

export async function listLessons(db: Db, topicId?: number): Promise<Lesson[]> {
  const rows = topicId
    ? await db.getAllAsync<Row>('SELECT * FROM lessons WHERE topic_id = ? ORDER BY position', topicId)
    : await db.getAllAsync<Row>('SELECT * FROM lessons ORDER BY topic_id, position');
  return rows.map(fromRow);
}

export async function getLesson(db: Db, id: number): Promise<Lesson | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM lessons WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function addSyllabus(db: Db, topicId: number, items: { title: string; outline: string }[]) {
  const row = await db.getFirstAsync<{ p: number | null }>(
    'SELECT MAX(position) AS p FROM lessons WHERE topic_id = ?',
    topicId
  );
  let pos = row?.p ?? 0;
  for (const it of items) {
    pos += 1;
    await db.runAsync(
      'INSERT INTO lessons (topic_id, position, title, outline) VALUES (?, ?, ?, ?)',
      topicId,
      pos,
      it.title,
      it.outline
    );
  }
  notifyChange();
}

export async function saveLessonContent(db: Db, id: number, content: LessonContent) {
  await db.runAsync('UPDATE lessons SET content = ? WHERE id = ?', JSON.stringify(content), id);
}

export async function markLessonDone(db: Db, id: number) {
  await db.runAsync(
    "UPDATE lessons SET status = 'done', done_at = ? WHERE id = ?",
    new Date().toISOString(),
    id
  );
  notifyChange();
}

export async function deleteSyllabus(db: Db, topicId: number) {
  await db.runAsync("DELETE FROM lessons WHERE topic_id = ? AND status = 'planned'", topicId);
  notifyChange();
}
