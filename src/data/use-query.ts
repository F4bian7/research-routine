import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { type Db, useDb } from '@/db/db';
import { subscribeChanges } from './changes';

// Runs `load` on focus and after every notifyChange(). `load` must be stable
// (module-level function or useCallback), otherwise it reloads on every render.
export function useQuery<T>(load: (db: Db) => Promise<T>) {
  const db = useDb();
  const [data, setData] = useState<T | undefined>(undefined);

  const refresh = useCallback(() => {
    let alive = true;
    load(db).then((v) => {
      if (alive) setData(v);
    });
    return () => {
      alive = false;
    };
  }, [db, load]);

  useFocusEffect(refresh);

  useEffect(() => subscribeChanges(() => void refresh()), [refresh]);

  return data;
}
