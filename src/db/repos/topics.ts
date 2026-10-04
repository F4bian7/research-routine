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

// Papers of a deleted topic keep their place in the queue, without a topic; people
// lose the topic from their list.
export async function deleteTopic(db: Db, id: number) {
  await db.runAsync('UPDATE papers SET topic_id = NULL WHERE topic_id = ?', id);
  const people = await db.getAllAsync<{ id: number; topic_ids: string }>(
    'SELECT id, topic_ids FROM people'
  );
  for (const p of people) {
    const ids = (JSON.parse(p.topic_ids) as number[]).filter((t) => t !== id);
    await db.runAsync('UPDATE people SET topic_ids = ? WHERE id = ?', JSON.stringify(ids), p.id);
  }
  await db.runAsync('DELETE FROM topics WHERE id = ?', id);
  notifyChange();
}
