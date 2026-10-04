// Full text from arXiv's HTML rendering (CORS enabled). Responses are kept in
// the Cache API, not in the SQLite file: that file is rewritten on every save.
const CACHE = 'paper-fulltext-v1';

export type FullText = {
  html: string;
  baseUrl: string; // for resolving relative image links
};

async function cachedFetch(url: string): Promise<Response | null> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE) : null;
  const hit = await cache?.match(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) return null;
  await cache?.put(url, res.clone());
  return res;
}

export async function fetchArxivHtml(id: string): Promise<FullText | null> {
  const url = `https://arxiv.org/html/${id}`;
  const res = await cachedFetch(url);
  if (!res) return null;
  const html = await res.text();
  // arXiv answers 200 with a notice page when no HTML version exists.
  if (!html.includes('ltx_document')) return null;
  return { html, baseUrl: url };
}

function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Title and authors from the HTML rendering, for papers OpenAlex does not know.
// The year comes from the identifier (YYMM.NNNNN).
export function arxivMetaFromHtml(id: string, html: string) {
  const title = stripTags(html.match(/<h1 class="ltx_title ltx_title_document">([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const people = [...html.matchAll(/<span class="ltx_personname">([\s\S]*?)(?:<br|<\/span>)/g)].map(
    (m) => stripTags(m[1])
  );
  const names = people.flatMap((p) => p.split(',')).map((n) => n.trim()).filter(Boolean);
  const authors = names.length > 1 ? `${names[0]} et al.` : (names[0] ?? '');
  const yy = id.match(/^(\d{2})\d{2}\./)?.[1];
  const abstract = stripTags(
    html.match(/<div class="ltx_abstract">([\s\S]*?)<\/div>/)?.[1]?.replace(/<h6[\s\S]*?<\/h6>/, '') ?? ''
  );
  return { title, authors, year: yy ? 2000 + Number(yy) : null, abstract, venue: 'arXiv' };
}

export function arxivPdfUrl(id: string) {
  return `https://arxiv.org/pdf/${id}`;
}
