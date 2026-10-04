import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';

import { DbContext } from './db';
import { migrateAndSeed } from './schema';

function Bridge({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

// Native: expo-sqlite. The web variant is db-provider.web.tsx.
export function DbProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName="research-routine.db" onInit={migrateAndSeed}>
      <Bridge>{children}</Bridge>
    </SQLiteProvider>
  );
}
