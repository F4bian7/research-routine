import type { Db } from '@/db/db';

import { notifyChange } from '@/data/changes';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Settings } from '../types';

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    reminderTime: stored.reminderTime ?? DEFAULT_SETTINGS.reminderTime,
    weekendCounts: stored.weekendCounts ?? DEFAULT_SETTINGS.weekendCounts,
    quickLinks: stored.quickLinks ?? DEFAULT_SETTINGS.quickLinks,
  };
}

export async function setSetting<K extends keyof Settings>(
  db: Db,
  key: K,
  value: Settings[K]
) {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    JSON.stringify(value)
  );
  notifyChange();
}
