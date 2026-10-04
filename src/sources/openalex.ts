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
