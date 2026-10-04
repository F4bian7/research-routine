import type { Database, SqlJsStatic } from 'sql.js';

import type { Db, SQLValue } from './db';

// sql.js is loaded as a plain script from /public instead of being bundled:
// its UMD build references Node modules that Metro cannot resolve.
const BASE = process.env.EXPO_BASE_URL ?? '';
const IDB_NAME = 'research-routine';
const IDB_STORE = 'files';
const IDB_KEY = 'db';

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

function openIdb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(idb: IDBDatabase) {
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(idb: IDBDatabase, bytes: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

class WebDb implements Db {
  private inTransaction = false;

  constructor(
    private db: Database,
    private idb: IDBDatabase
  ) {}

  // Every write is persisted before the promise resolves; the file is small.
  private async persist() {
    if (this.inTransaction) return;
    await idbPut(this.idb, this.db.export());
  }

  private query<T>(sql: string, params: SQLValue[]): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async execAsync(sql: string) {
    this.db.exec(sql);
    await this.persist();
  }

  async runAsync(sql: string, ...params: SQLValue[]) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const row = this.query<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0];
    await this.persist();
    return { lastInsertRowId: row?.id ?? 0, changes };
  }

  async getFirstAsync<T>(sql: string, ...params: SQLValue[]) {
    return this.query<T>(sql, params)[0] ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: SQLValue[]) {
    return this.query<T>(sql, params);
  }

  async withExclusiveTransactionAsync(task: (tx: Db) => Promise<void>) {
    this.db.exec('BEGIN');
    this.inTransaction = true;
    try {
      await task(this);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.inTransaction = false;
    }
    await this.persist();
  }
}

export async function openWebDb(): Promise<Db> {
  if (!window.initSqlJs) await loadScript(`${BASE}/sql-wasm.js`);
  const SQL = await window.initSqlJs!({ locateFile: (file) => `${BASE}/${file}` });
  const idb = await openIdb();
  const saved = await idbGet(idb);
  // Ask the browser not to evict the data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
  return new WebDb(saved ? new SQL.Database(saved) : new SQL.Database(), idb);
}
