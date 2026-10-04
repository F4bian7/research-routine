import { useEffect } from 'react';

import { useQuery } from '@/data/use-query';
import { getSettings } from '@/db/repos/settings';
import { setOpenAlexKey } from '@/sources/openalex-client';

// Hands the OpenAlex key from Settings to the API client, also after it changes.
export function ServiceKeys() {
  const settings = useQuery(getSettings);
  const key = settings?.openalexKey ?? null;
  useEffect(() => setOpenAlexKey(key), [key]);
  return null;
}
