import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';

export type LearnDay = { date: string; xp: number; reviewed: number; lessonId: number | null };

export async function getLearnDay(db: Db, date: string): Promise<LearnDay | null> {
  return db.getFirstAsync<LearnDay>(
    'SELECT date, xp, reviewed, lesson_id AS lessonId FROM learn_log WHERE date = ?',
    date
  );
}

export async function totalXp(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ xp: number | null }>('SELECT SUM(xp) AS xp FROM learn_log');
  return row?.xp ?? 0;
}

// Adds to today's log; several sessions on one day add up.
export async function logLearning(db: Db, date: string, xp: number, reviewed: number, lessonId: number | null) {
  const prev = await getLearnDay(db, date);
  await db.runAsync(
    'INSERT OR REPLACE INTO learn_log (date, xp, reviewed, lesson_id) VALUES (?, ?, ?, ?)',
    date,
    (prev?.xp ?? 0) + xp,
    (prev?.reviewed ?? 0) + reviewed,
    lessonId ?? prev?.lessonId ?? null
  );
  notifyChange();
}

// The routine task of the day (a bonus since the streak follows Learn).
export async function isRoutineDone(db: Db, date: string) {
  return !!(await db.getFirstAsync('SELECT date FROM routine_done WHERE date = ?', date));
}

export async function setRoutineDone(db: Db, date: string, done: boolean) {
  if (done) await db.runAsync('INSERT OR IGNORE INTO routine_done (date) VALUES (?)', date);
  else await db.runAsync('DELETE FROM routine_done WHERE date = ?', date);
  notifyChange();
}
