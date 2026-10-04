import { useEffect } from 'react';

import { useQuery } from '@/data/use-query';
import { useDb } from '@/db/db';
import { getSettings, setSetting } from '@/db/repos/settings';
import { todayKey } from '@/domain/dates';
import { onGeminiUsage } from '@/sources/gemini';
import { setOpenAlexKey } from '@/sources/openalex-client';

// Hands the OpenAlex key from Settings to the API client, and counts Gemini requests
// per model and day for the usage line in Settings.
export function ServiceKeys() {
  const db = useDb();
  const settings = useQuery(getSettings);
  const key = settings?.openalexKey ?? null;
  useEffect(() => setOpenAlexKey(key), [key]);

  useEffect(() => {
    let chain = Promise.resolve();
    const stop = onGeminiUsage((model) => {
      chain = chain.then(async () => {
        const s = await getSettings(db);
        const today = todayKey();
        const usage = s.geminiUsage.date === today ? s.geminiUsage : { date: today, counts: {} };
        await setSetting(db, 'geminiUsage', {
          date: today,
          counts: { ...usage.counts, [model]: (usage.counts[model] ?? 0) + 1 },
        });
      });
    });
    return () => {
      stop();
    };
  }, [db]);
  return null;
}
