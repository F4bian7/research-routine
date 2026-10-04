import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Topic } from '../types';

export async function listTopics(db: Db): Promise<Topic[]> {
  return db.getAllAsync<Topic>('SELECT id, name, color, keywords FROM topics ORDER BY name');
}

export async function addTopic(db: Db, t: Omit<Topic, 'id'>): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO topics (name, color, keywords) VALUES (?, ?, ?)',
    t.name,
    t.color,
    t.keywords
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function updateTopic(db: Db, t: Topic) {
  await db.runAsync(
    'UPDATE topics SET name = ?, color = ?, keywords = ? WHERE id = ?',
    t.name,
    t.color,
    t.keywords,
    t.id
  );
  notifyChange();
}

// Papers of a deleted topic keep their place in the queue, without a topic.
export async function deleteTopic(db: Db, id: number) {
  await db.runAsync('UPDATE papers SET topic_id = NULL WHERE topic_id = ?', id);
  await db.runAsync('DELETE FROM topics WHERE id = ?', id);
  notifyChange();
}
