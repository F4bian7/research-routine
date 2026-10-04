import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Summary } from '../types';

export async function getSummary(db: Db, paperId: number): Promise<Summary | null> {
  const row = await db.getFirstAsync<{ json: string }>(
    'SELECT json FROM summaries WHERE paper_id = ?',
    paperId
  );
  return row ? (JSON.parse(row.json) as Summary) : null;
}

export async function saveSummary(db: Db, paperId: number, summary: Summary, model: string) {
  await db.runAsync(
    'INSERT OR REPLACE INTO summaries (paper_id, json, model, created_at) VALUES (?, ?, ?, ?)',
    paperId,
    JSON.stringify(summary),
    model,
    new Date().toISOString()
  );
  notifyChange();
}
