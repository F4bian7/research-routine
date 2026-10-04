import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type Db, DbContext } from './db';
import { migrateAndSeed } from './schema';
import { openWebDb } from './web-db';

// Web: sql.js in memory, persisted to IndexedDB after every write.
export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openWebDb()
      .then(async (d) => {
        await migrateAndSeed(d);
        setDb(d);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text>Could not load the database: {error}</Text>
      </View>
    );
  }
  if (!db) return null;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 },
});
