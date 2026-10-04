import { arxivMetaFromHtml, fetchArxivHtml } from './arxiv';
import type { PaperRef } from './links';
import { fetchOpenAlex, type PaperMeta } from './openalex';

export type { PaperMeta };

// OpenAlex first; it misses many arXiv-only papers, so fall back to arXiv's HTML.
export async function fetchMeta(ref: PaperRef): Promise<PaperMeta | null> {
  const meta = await fetchOpenAlex(ref).catch(() => null);
  if (meta?.title || ref.kind !== 'arxiv') return meta;
  const full = await fetchArxivHtml(ref.id);
  return full ? arxivMetaFromHtml(ref.id, full.html) : null;
}
