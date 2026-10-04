import type { FeedPaper } from './feed-types';
import type { PaperRef } from './links';

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
  authorships?: { author: { display_name: string } }[];
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
  const res = await fetch(`https://api.openalex.org/works/doi:${encodeURI(doi)}`);
  if (!res.ok) return null;
  const w = (await res.json()) as Work;
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
  };
}

// Recent works whose title or abstract match the query: arXiv preprints or
// PubMed-indexed papers. Keep queries small: OpenAlex rejects (429) searches with
// many boolean operators, so callers send one keyword per request.
export async function searchRecent(
  query: string,
  kind: 'arxiv' | 'pubmed',
  fromDate: string,
  topicId: number | null
): Promise<FeedPaper[]> {
  const filter = [
    `from_publication_date:${fromDate}`,
    kind === 'arxiv' ? `primary_location.source.id:${ARXIV_SOURCE}` : 'has_pmid:true',
    `title_and_abstract.search:${encodeURIComponent(query.replace(/,/g, ' '))}`,
  ].join(',');
  const url =
    `https://api.openalex.org/works?filter=${filter}` +
    `&sort=publication_date:desc&per_page=25&select=${SELECT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const data = (await res.json()) as { results?: Work[] };
  return (data.results ?? []).map((w) => workToFeedPaper(w, topicId)).filter((p) => p.title);
}
