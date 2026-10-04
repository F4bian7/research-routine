import type { Topic } from '@/db/types';
import { parseKeywords } from './keywords';

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Bluesky search is fuzzy; only accept accounts whose display name or handle contains
// every part of the name, e.g. "Fabian Isensee" -> "fabian" and "isensee".
export function nameMatches(name: string, displayName: string, handle = ''): boolean {
  const parts = normalize(name)
    .split(/[\s.,-]+/)
    .filter((p) => p.length > 1);
  const hay = normalize(`${displayName} ${handle}`);
  return parts.length > 0 && parts.every((p) => hay.includes(p));
}

function keywordHits(keyword: string, text: string) {
  const parts = (keyword.match(/"[^"]+"|\S+/g) ?? []).map((p) => normalize(p.replace(/"/g, '')));
  return parts.length > 0 && parts.every((p) => text.includes(p));
}

// Topics whose keywords appear in at least `min` of the texts (titles and abstracts).
export function matchTopics(topics: Topic[], texts: string[], min = 2): number[] {
  const norm = texts.map(normalize);
  return topics
    .filter((t) => {
      const keys = parseKeywords(t.keywords);
      const hits = norm.filter((x) => keys.some((k) => keywordHits(k, x))).length;
      return hits >= min;
    })
    .map((t) => t.id);
}

// For comparing person names: no accents, no case, no dots or extra spaces.
// "B. Van Ginneken" and "b van ginneken" are equal; "Knöll" equals "Knoll".
export function normalizeName(name: string) {
  return normalize(name)
    .replace(/[.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
