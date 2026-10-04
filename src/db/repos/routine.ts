import type { Db } from '@/db/db';

import { notifyChange } from '@/data/changes';
import type { DayTask, TaskKind } from '../types';

type Row = {
  weekday: number;
  title: string;
  description: string;
  duration_min: number;
  enabled: number;
  kind: string;
};

function fromRow(r: Row): DayTask {
  return {
    weekday: r.weekday,
    title: r.title,
    description: r.description,
    durationMin: r.duration_min,
    enabled: r.enabled === 1,
    kind: r.kind as TaskKind,
  };
}

export async function listRoutine(db: Db): Promise<DayTask[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM day_tasks ORDER BY weekday');
  return rows.map(fromRow);
}

export async function saveDayTask(db: Db, t: DayTask) {
  await db.runAsync(
    `INSERT OR REPLACE INTO day_tasks (weekday, title, description, duration_min, enabled, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
    t.weekday,
    t.title,
    t.description,
    t.durationMin,
    t.enabled ? 1 : 0,
    t.kind
  );
  notifyChange();
}
