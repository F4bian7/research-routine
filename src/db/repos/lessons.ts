import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Lesson, LessonContent, LessonKind, PaperMeta } from '../types';

type Row = {
  id: number;
  topic_id: number | null;
  position: number;
  title: string;
  outline: string;
  content: string | null;
  status: string;
  done_at: string | null;
  parent_id: number | null;
  kind: string | null;
  prompt: string | null;
  paper_url: string | null;
  paper_meta: string | null;
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
    parentId: r.parent_id ?? null,
    kind: (r.kind ?? 'core') as LessonKind,
    prompt: r.prompt ?? '',
    paperUrl: r.paper_url ?? '',
    paperMeta: r.paper_meta ? (JSON.parse(r.paper_meta) as PaperMeta) : {},
  };
}

// The course plan of a topic (or of all topics): core lessons only.
export async function listLessons(db: Db, topicId?: number): Promise<Lesson[]> {
  const rows = topicId
    ? await db.getAllAsync<Row>(
        "SELECT * FROM lessons WHERE topic_id = ? AND kind = 'core' ORDER BY position",
        topicId
      )
    : await db.getAllAsync<Row>("SELECT * FROM lessons WHERE kind = 'core' ORDER BY topic_id, position");
  return rows.map(fromRow);
}

// Everything explored from a lesson, oldest first.
export async function listExplorations(db: Db, parentId: number): Promise<Lesson[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM lessons WHERE parent_id = ? ORDER BY id', parentId);
  return rows.map(fromRow);
}

export async function countExplorations(db: Db): Promise<Map<number, number>> {
  const rows = await db.getAllAsync<{ parent_id: number; n: number }>(
    'SELECT parent_id, COUNT(*) AS n FROM lessons WHERE parent_id IS NOT NULL GROUP BY parent_id'
  );
  return new Map(rows.map((r) => [r.parent_id, r.n]));
}

export async function addExploration(
  db: Db,
  parent: Lesson,
  kind: LessonKind,
  title: string,
  prompt: string,
  content: LessonContent
): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO lessons (topic_id, position, title, outline, content, status, done_at, parent_id, kind, prompt)
     VALUES (?, ?, ?, '', ?, 'done', ?, ?, ?, ?)`,
    parent.topicId,
    parent.position,
    title,
    JSON.stringify(content),
    new Date().toISOString(),
    parent.id,
    kind,
    prompt
  );
  return r.lastInsertRowId;
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

// The reading path of a topic, in reading order.
export async function listPath(db: Db, topicId?: number): Promise<Lesson[]> {
  const rows = topicId
    ? await db.getAllAsync<Row>(
        "SELECT * FROM lessons WHERE topic_id = ? AND kind = 'paper' ORDER BY position",
        topicId
      )
    : await db.getAllAsync<Row>("SELECT * FROM lessons WHERE kind = 'paper' ORDER BY topic_id, position");
  return rows.map(fromRow);
}

export type PathItem = { title: string; url: string; meta: PaperMeta };

// Appends papers to a topic's path (after its last item), skipping ones already on it.
export async function addToPath(db: Db, topicId: number, items: PathItem[]): Promise<number> {
  const existing = new Set((await listPath(db, topicId)).map((l) => l.paperUrl.toLowerCase()));
  const row = await db.getFirstAsync<{ p: number | null }>(
    "SELECT MAX(position) AS p FROM lessons WHERE topic_id = ? AND kind = 'paper'",
    topicId
  );
  let pos = row?.p ?? 0;
  let added = 0;
  for (const it of items) {
    if (existing.has(it.url.toLowerCase())) continue;
    existing.add(it.url.toLowerCase());
    pos += 1;
    added += 1;
    await db.runAsync(
      `INSERT INTO lessons (topic_id, position, title, outline, kind, paper_url, paper_meta)
       VALUES (?, ?, ?, ?, 'paper', ?, ?)`,
      topicId,
      pos,
      it.title,
      it.meta.why ?? '',
      it.url,
      JSON.stringify(it.meta)
    );
  }
  notifyChange();
  return added;
}

export async function deletePlannedPath(db: Db, topicId: number) {
  await db.runAsync(
    "DELETE FROM lessons WHERE topic_id = ? AND kind = 'paper' AND status = 'planned' AND content IS NULL",
    topicId
  );
  notifyChange();
}
