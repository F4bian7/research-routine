/// <reference types="node" />
// Test helper: an in-memory database over sql.js, the engine the web build uses.
import initSqlJs, { type Database } from 'sql.js';

import type { Db, SQLValue } from '../db/db';

// In-memory Db over sql.js, the same engine the web build uses.
function memoryDb(db: Database): Db {
  const query = <T>(sql: string, params: SQLValue[]) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  };
  const self: Db = {
    execAsync: async (sql) => void db.exec(sql),
    runAsync: async (sql, ...params) => {
      db.run(sql, params);
      const id = query<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0].id;
      return { lastInsertRowId: id, changes: db.getRowsModified() };
    },
    getFirstAsync: async <T,>(sql: string, ...params: SQLValue[]) => query<T>(sql, params)[0] ?? null,
    getAllAsync: async <T,>(sql: string, ...params: SQLValue[]) => query<T>(sql, params),
    withExclusiveTransactionAsync: async (task) => {
      db.exec('BEGIN');
      try {
        await task(self);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return self;
}

export async function freshDb() {
  const SQL = await initSqlJs();
  const db = memoryDb(new SQL.Database());
  const { migrateAndSeed } = await import('../db/schema');
  await migrateAndSeed(db);
  return db;
}

