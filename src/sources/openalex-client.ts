// All OpenAlex requests go through here. Without a key OpenAlex gives each network a
// small daily budget (about 100 searches); a free key raises it tenfold. Answers are
// kept for the day in the Cache API, so reopening the app does not spend it again.

let apiKey: string | null = null;

export function setOpenAlexKey(key: string | null) {
  apiKey = key?.trim() || null;
}

export class OpenAlexError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly budget = false
  ) {
    super(message);
  }
}

const CACHE = 'openalex-v1';

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// GET a JSON document. `fresh` skips today's cached copy (the Refresh button).
export async function oaGet<T>(url: string, opts: { fresh?: boolean; cacheDay?: boolean } = {}): Promise<T> {
  const cache = opts.cacheDay && typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  const key = `${url}#${localDay()}`;
  if (cache && !opts.fresh) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as T;
  }
  const res = await fetch(url, apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined);
  if (res.status === 404) throw new OpenAlexError('Not found', 404);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const budget = res.status === 429 && /budget|credits?/i.test(body.message ?? '');
    throw new OpenAlexError(body.message ?? `OpenAlex ${res.status}`, res.status, budget);
  }
  const text = await res.text();
  if (cache) {
    await cache
      .put(key, new Response(text, { headers: { 'content-type': 'application/json' } }))
      .catch(() => undefined);
  }
  return JSON.parse(text) as T;
}

export function openAlexHint(e: unknown): string | null {
  if (e instanceof OpenAlexError && e.budget) {
    return apiKey
      ? 'The daily OpenAlex budget of your key is used up; it resets at midnight UTC.'
      : 'The free daily OpenAlex budget of this network is used up (it resets at midnight UTC). A free OpenAlex key in Settings gives ten times more.';
  }
  return null;
}
