import { createContext, useContext } from 'react';

// The subset of expo-sqlite's SQLiteDatabase the app uses. On native it is
// expo-sqlite itself; on web it is sql.js persisted to IndexedDB (web-db.ts).
// Repos depend on this interface only, so both backends run the same SQL.
export type SQLValue = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: SQLValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SQLValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SQLValue[]): Promise<T[]>;
  withExclusiveTransactionAsync(task: (tx: Db) => Promise<void>): Promise<void>;
}

export const DbContext = createContext<Db | null>(null);

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb() outside of DbProvider');
  return db;
}
