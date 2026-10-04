// Recognises paper identifiers in a pasted link.
export type PaperRef =
  | { kind: 'arxiv'; id: string } // without version, e.g. 2304.12306
  | { kind: 'doi'; doi: string }
  | { kind: 'url'; url: string };

const ARXIV_NEW = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i;
const ARXIV_OLD = /arxiv\.org\/(?:abs|pdf|html)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i;
const ARXIV_DOI = /10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i;
const DOI = /(10\.\d{4,9}\/[^\s?#]+)/;

export function parsePaperLink(input: string): PaperRef {
  const s = input.trim();
  const m = s.match(ARXIV_NEW) ?? s.match(ARXIV_OLD) ?? s.match(ARXIV_DOI);
  if (m) return { kind: 'arxiv', id: m[1] };
  const bare = s.match(/^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  if (bare) return { kind: 'arxiv', id: bare[1] };
  const d = s.match(DOI);
  if (d) return { kind: 'doi', doi: decodeURIComponent(d[1]).replace(/[.,;)]+$/, '') };
  return { kind: 'url', url: s };
}

export function canonicalUrl(ref: PaperRef): string {
  if (ref.kind === 'arxiv') return `https://arxiv.org/abs/${ref.id}`;
  if (ref.kind === 'doi') return `https://doi.org/${ref.doi}`;
  return ref.url;
}
