import type { Db, SQLValue } from '@/db/db';
import { todayKey } from '@/domain/dates';
import { notifyChange } from './changes';

// JSON backup of every table. The Gemini key is never exported, and an import keeps
// the key already on the device.
export const BACKUP_APP = 'research-routine';
export const BACKUP_VERSION = 1;

// In dependency order: a table comes after the tables it references.
const TABLES = [
  'topics',
  'people',
  'papers',
  'notes',
  'lessons',
  'cards',
  'day_tasks',
  'completions',
  'routine_done',
  'learn_log',
  'settings',
  'summaries',
  'feed_seen',
] as const;
type Table = (typeof TABLES)[number];

const SECRET_SETTINGS = ['geminiApiKey', 'openalexKey'];

export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  tables: Record<Table, Record<string, SQLValue>[]>;
};

export async function exportBackup(db: Db): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const t of TABLES) {
    tables[t] = await db.getAllAsync<Record<string, SQLValue>>(`SELECT * FROM ${t}`);
  }
  tables.settings = tables.settings.filter((r) => !SECRET_SETTINGS.includes(String(r.key)));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export class BackupError extends Error {}

function validate(data: unknown): Backup {
  const b = data as Partial<Backup> | null;
  if (!b || b.app !== BACKUP_APP || typeof b.tables !== 'object' || !b.tables) {
    throw new BackupError('This is not a Research Routine backup.');
  }
  if ((b.version ?? 0) > BACKUP_VERSION) {
    throw new BackupError('This backup comes from a newer version of the app.');
  }
  for (const t of TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new BackupError(`Table ${t} is broken.`);
    // Older backups lack newer tables; those are simply restored empty.
  }
  return b as Backup;
}

// Replaces all data with the backup, in one transaction: either all of it or nothing.
export async function importBackup(db: Db, data: unknown) {
  const backup = validate(data);
  const columns: Record<string, Set<string>> = {};
  for (const t of TABLES) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`);
    columns[t] = new Set(info.map((c) => c.name));
  }
  const keep = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${SECRET_SETTINGS.map(() => '?').join(', ')})`,
    ...SECRET_SETTINGS
  );

  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of TABLES) await tx.runAsync(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      for (const row of backup.tables[t] ?? []) {
        // Only columns this version knows; unknown ones from other versions are dropped.
        const cols = Object.keys(row).filter((c) => columns[t].has(c));
        if (cols.length === 0) continue;
        if (t === 'settings' && SECRET_SETTINGS.includes(String(row.key))) continue;
        await tx.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          ...cols.map((c) => row[c] ?? null)
        );
      }
    }
    for (const k of keep) {
      await tx.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k.key, k.value);
    }
  });
  notifyChange();
}

export function backupFileName() {
  return `research-routine-backup-${todayKey()}.json`;
}
