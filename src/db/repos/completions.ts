import type { Db } from '@/db/db';

import { notifyChange } from '@/data/changes';
import type { Completion } from '../types';

export async function listCompletions(db: Db): Promise<Completion[]> {
  return db.getAllAsync<Completion>(
    'SELECT date, task_title AS taskTitle FROM completions ORDER BY date'
  );
}

export async function markDone(db: Db, date: string, taskTitle: string) {
  await db.runAsync(
    'INSERT OR REPLACE INTO completions (date, task_title) VALUES (?, ?)',
    date,
    taskTitle
  );
  notifyChange();
}

export async function unmarkDone(db: Db, date: string) {
  await db.runAsync('DELETE FROM completions WHERE date = ?', date);
  notifyChange();
}
