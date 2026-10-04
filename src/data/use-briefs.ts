import { useEffect, useState } from 'react';

import { useDb } from '@/db/db';
import type { Brief, BriefInput } from '@/sources/briefs';
import { explainError } from '@/sources/gemini';
import { ensureBriefs, getBriefs } from './briefs';

type State = { key: string; map: Map<string, Brief>; done: boolean; error: string };

// Briefs for the items on screen: saved ones at once, missing ones from Gemini.
export function useBriefs(inputs: BriefInput[], enabled: boolean) {
  const db = useDb();
  const key = inputs.map((i) => i.id).join('|');
  const [state, setState] = useState<State>({ key: '', map: new Map(), done: false, error: '' });

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split('|');
    getBriefs(db, ids).then((map) => {
      if (alive) setState({ key, map, done: !enabled, error: '' });
      if (!enabled) return;
      ensureBriefs(db, inputs)
        .then((all) => alive && setState({ key, map: all, done: true, error: '' }))
        .catch((e: unknown) => alive && setState({ key, map, done: true, error: explainError(e) }));
    });
    return () => {
      alive = false;
    };
    // `inputs` changes identity on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, db]);

  const current = state.key === key;
  return {
    briefs: current ? state.map : new Map<string, Brief>(),
    pending: enabled && !!key && !(current && state.done),
    error: current ? state.error : '',
  };
}

export function byScore<T>(items: T[], id: (t: T) => string, briefs: Map<string, Brief>): T[] {
  return items
    .map((item, i) => ({ item, i, s: briefs.get(id(item))?.score ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
