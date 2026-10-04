import type { AuthorProfile } from '@/db/types';
import type { FeedPaper } from './feed-types';
import type { PaperRef } from './links';
import { OpenAlexError, oaGet } from './openalex-client';

// Metadata and abstract from OpenAlex (free, no key, CORS enabled).
// No mailto parameter on purpose: it would put an email address into the URL.
export type PaperMeta = {
  title: string;
  authors: string;
  year: number | null;
  abstract: string;
  venue: string;
};

type Work = {
  id?: string;
  doi?: string | null;
  publication_date?: string;
  title?: string;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: {
    author: { id?: string; display_name: string; orcid?: string | null };
    institutions?: { display_name: string }[];
  }[];
  primary_location?: { source?: { display_name?: string } | null } | null;
};

export function rebuildAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(' ');
}

export function formatAuthors(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names[0]} et al.`;
}

export async function fetchOpenAlex(ref: PaperRef): Promise<PaperMeta | null> {
  const doi = ref.kind === 'arxiv' ? `10.48550/arXiv.${ref.id}` : ref.kind === 'doi' ? ref.doi : null;
  if (!doi) return null;
  let w: Work;
  try {
    w = await oaGet<Work>(`https://api.openalex.org/works/doi:${encodeURI(doi)}`, { cacheDay: true });
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
  return {
    title: w.title ?? '',
    authors: formatAuthors((w.authorships ?? []).map((a) => a.author.display_name)),
    year: w.publication_year ?? null,
    abstract: rebuildAbstract(w.abstract_inverted_index),
    venue: w.primary_location?.source?.display_name ?? '',
  };
}

const ARXIV_SOURCE = 'S4306400194';
const SELECT = 'id,doi,title,publication_year,publication_date,authorships,abstract_inverted_index,primary_location';

export function workToFeedPaper(w: Work, topicId: number | null): FeedPaper {
  const doi = (w.doi ?? '').replace(/^https:\/\/doi\.org\//i, '');
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1];
  return {
    id: arxiv ? `arxiv:${arxiv}` : doi ? `doi:${doi.toLowerCase()}` : (w.id ?? ''),
    title: w.title ?? '',
    authors: formatAuthors((w.authorships ?? []).map((a) => a.author.display_name)),
    year: w.publication_year ?? null,
    date: w.publication_date ?? '',
    url: arxiv ? `https://arxiv.org/abs/${arxiv}` : doi ? `https://doi.org/${doi}` : (w.id ?? ''),
    abstract: rebuildAbstract(w.abstract_inverted_index),
    venue: arxiv ? 'arXiv' : (w.primary_location?.source?.display_name ?? ''),
    topicId,
    authorIds: (w.authorships ?? []).map((a) => shortId(a.author.id ?? '')).filter(Boolean),
    authorOrcids: (w.authorships ?? []).map((a) => a.author.orcid ?? '').filter(Boolean),
  };
}

export function shortId(openalexUrl: string) {
  return openalexUrl.split('/').pop() ?? '';
}

// Recent works whose title or abstract match the query: arXiv preprints or
// PubMed-indexed papers. Keep queries small: OpenAlex rejects (429) searches with
// many boolean operators, so callers send one keyword per request.
export async function searchRecent(
  query: string,
  kind: 'arxiv' | 'pubmed',
  fromDate: string,
  topicId: number | null,
  fresh = false
): Promise<FeedPaper[]> {
  const filter = [
    `from_publication_date:${fromDate}`,
    kind === 'arxiv' ? `primary_location.source.id:${ARXIV_SOURCE}` : 'has_pmid:true',
    `title_and_abstract.search:${encodeURIComponent(query.replace(/,/g, ' '))}`,
  ].join(',');
  const url =
    `https://api.openalex.org/works?filter=${filter}` +
    `&sort=publication_date:desc&per_page=25&select=${SELECT}`;
  const data = await oaGet<{ results?: Work[] }>(url, { cacheDay: true, fresh });
  return (data.results ?? []).map((w) => workToFeedPaper(w, topicId)).filter((p) => p.title);
}

export type AuthorCandidate = AuthorProfile;

type AuthorRow = {
  id: string;
  display_name: string;
  last_known_institutions?: { display_name: string }[] | null;
  works_count?: number;
  cited_by_count?: number;
  topics?: { display_name: string }[] | null;
  orcid?: string | null;
};

export async function searchAuthors(name: string): Promise<AuthorCandidate[]> {
  const url =
    `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per_page=6` +
    '&select=id,display_name,last_known_institutions,works_count,cited_by_count,topics,orcid';
  const data = await oaGet<{ results?: AuthorRow[] }>(url, { cacheDay: true });
  // Most prolific first: the real profile usually has far more works than its split-off duplicates.
  return (data.results ?? [])
    .map((a) => ({
    id: a.id.split('/').pop() ?? a.id,
    name: a.display_name,
    institutions: (a.last_known_institutions ?? []).map((i) => i.display_name),
    works: a.works_count ?? 0,
    citations: a.cited_by_count ?? 0,
    topic: a.topics?.[0]?.display_name ?? '',
    orcid: a.orcid ?? null,
  }))
    .sort((x, y) => y.works - x.works);
}

// An author's newest works, as feed papers.
export async function authorWorks(authorId: string): Promise<FeedPaper[]> {
  const url =
    `https://api.openalex.org/works?filter=author.id:${encodeURIComponent(authorId)}` +
    `&sort=publication_date:desc&per_page=20&select=${SELECT}`;
  const data = await oaGet<{ results?: Work[] }>(url, { cacheDay: true });
  return (data.results ?? []).map((w) => workToFeedPaper(w, null)).filter((p) => p.title);
}

// Newest works of several authors at once (OpenAlex allows up to 50 values per filter).
export async function worksByAuthors(authorIds: string[], perPage = 50, fresh = false): Promise<FeedPaper[]> {
  return worksBy('author.id', authorIds, perPage, fresh);
}

// By ORCID: also finds papers OpenAlex filed under a profile the user does not know yet.
export async function worksByOrcids(orcids: string[], perPage = 50, fresh = false): Promise<FeedPaper[]> {
  return worksBy('author.orcid', orcids, perPage, fresh);
}

async function worksBy(field: string, values: string[], perPage: number, fresh = false): Promise<FeedPaper[]> {
  if (values.length === 0) return [];
  const url =
    `https://api.openalex.org/works?filter=${field}:${values.slice(0, 50).map(encodeURIComponent).join('|')}` +
    `&sort=publication_date:desc&per_page=${perPage}&select=${SELECT}`;
  const data = await oaGet<{ results?: Work[] }>(url, { cacheDay: true, fresh });
  return (data.results ?? []).map((w) => workToFeedPaper(w, null)).filter((p) => p.title);
}

export type CoAuthor = { id: string; name: string; institution: string; count: number };

// Authors of the given DOIs, most frequent first. One request for up to 50 DOIs.
export async function authorsOfDois(dois: string[]): Promise<CoAuthor[]> {
  if (dois.length === 0) return [];
  const url =
    `https://api.openalex.org/works?filter=doi:${dois.slice(0, 50).map(encodeURIComponent).join('|')}` +
    '&per_page=50&select=doi,authorships';
  const data = await oaGet<{ results?: Work[] }>(url, { cacheDay: true });
  const byId = new Map<string, CoAuthor>();
  for (const w of data.results ?? []) {
    for (const a of w.authorships ?? []) {
      const id = shortId(a.author.id ?? '');
      if (!id) continue;
      const entry = byId.get(id) ?? {
        id,
        name: a.author.display_name,
        institution: a.institutions?.[0]?.display_name ?? '',
        count: 0,
      };
      entry.count += 1;
      byId.set(id, entry);
    }
  }
  return [...byId.values()].sort((x, y) => y.count - x.count);
}

// Author ids and ORCIDs of one paper, to link notes to the people who wrote it.
export async function fetchWorkAuthors(ref: PaperRef): Promise<{ ids: string[]; orcids: string[] }> {
  const doi = ref.kind === 'arxiv' ? `10.48550/arXiv.${ref.id}` : ref.kind === 'doi' ? ref.doi : null;
  if (!doi) return { ids: [], orcids: [] };
  const w = await oaGet<Work>(`https://api.openalex.org/works/doi:${encodeURI(doi)}?select=authorships`, {
    cacheDay: true,
  }).catch(() => null);
  if (!w) return { ids: [], orcids: [] };
  return {
    ids: (w.authorships ?? []).map((a) => shortId(a.author.id ?? '')).filter(Boolean),
    orcids: (w.authorships ?? []).map((a) => a.author.orcid ?? '').filter(Boolean),
  };
}

// The most cited papers of the last weeks across all of science: what the whole
// research world is reading, beyond the user's own topics. A list query, cheap on budget.
export async function topRecentPapers(fromDate: string, fresh = false): Promise<FeedPaper[]> {
  const url =
    `https://api.openalex.org/works?filter=from_publication_date:${fromDate},type:article,has_abstract:true` +
    `&sort=cited_by_count:desc&per_page=25&select=${SELECT}`;
  const data = await oaGet<{ results?: Work[] }>(url, { cacheDay: true, fresh });
  return (data.results ?? []).map((w) => workToFeedPaper(w, null)).filter((p) => p.title);
}
