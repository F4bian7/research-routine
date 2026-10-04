import type { Person, PersonLinks } from '@/db/types';

// Turns what the user typed (handle, @handle or full link) into a link to open.
export function linkFor(kind: keyof PersonLinks, value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '');
  if (kind === 'bluesky') return `https://bsky.app/profile/${handle}`;
  if (kind === 'x') return `https://x.com/${handle}`;
  return `https://${v}`;
}

// The Bluesky handle, from a handle or a profile link.
export function blueskyHandle(value: string | undefined): string | null {
  const v = (value ?? '').trim().replace(/^@/, '');
  if (!v) return null;
  const m = v.match(/bsky\.app\/profile\/([^/?#]+)/);
  const h = m ? m[1] : v;
  return h.includes('.') ? h : null;
}

export const LINK_LABEL: Record<keyof PersonLinks, string> = {
  scholar: 'Google Scholar',
  semanticScholar: 'Semantic Scholar',
  bluesky: 'Bluesky',
  x: 'X',
  website: 'Website',
};

// A Google Scholar search when no profile link is stored.
export function scholarSearchUrl(p: Person) {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(`author:"${p.name}"`)}`;
}
