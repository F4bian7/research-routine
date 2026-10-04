// Sources outside the literature databases: blogs (RSS/Atom), GitHub and Hacker News.
// All are read straight from the device; they need to allow it (CORS), which GitHub,
// Hacker News (Algolia) and many blogs, e.g. those on GitHub Pages, do.

export type WebItem = {
  id: string;
  source: 'blog' | 'github' | 'hn';
  title: string;
  url: string;
  at: string; // ISO date
  summary: string;
  points?: number;
  comments?: number;
  discussion?: string; // Hacker News thread
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

// Markup out, including the contents of style and script blocks.
const strip = (s: string) =>
  s.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();

// Titles: tags in the raw XML are markup, escaped ones are text ("A <b> tag").
function text(raw: string) {
  return squeeze(decode(strip(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))));
}

// Summaries are often escaped HTML; strip markup on both levels.
function plain(html: string) {
  return squeeze(strip(decode(strip(decode(html)))));
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

// RSS 2.0 and Atom, without a full XML parser (feeds are simple and this runs anywhere).
export function parseFeed(xml: string, feedUrl: string): WebItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks
    .map((b) => {
      const atomLink =
        b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
        b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
      const link = decode(tag(b, 'link').trim()) || atomLink || '';
      const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
      const at = date ? new Date(decode(date).trim()) : null;
      const summary = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400);
      const url = link ? new URL(link, feedUrl).href : feedUrl;
      return {
        id: `blog:${url}`,
        source: 'blog' as const,
        title: text(tag(b, 'title')) || url,
        url,
        at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : '',
        summary,
      };
    })
    .filter((i) => i.at);
}

export async function fetchFeed(url: string): Promise<WebItem[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return parseFeed(await res.text(), url).slice(0, 15);
}

type Repo = { full_name: string; html_url: string; description: string | null; created_at: string; stargazers_count: number; fork: boolean };

// Repositories the user created recently (a new project is news; pushes are noise).
export async function githubRepos(user: string, days = 120): Promise<WebItem[]> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=created&per_page=10`);
  if (!res.ok) throw new Error(`github ${res.status}`);
  const since = Date.now() - days * 86_400_000;
  return ((await res.json()) as Repo[])
    .filter((r) => !r.fork && new Date(r.created_at).getTime() > since)
    .map((r) => ({
      id: `gh:${r.full_name}`,
      source: 'github' as const,
      title: `New repository: ${r.full_name}`,
      url: r.html_url,
      at: r.created_at,
      summary: r.description ?? '',
      points: r.stargazers_count,
    }));
}

type Hit = {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
};

function hitToItem(h: Hit): WebItem {
  const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
  return {
    id: `hn:${h.objectID}`,
    source: 'hn',
    title: h.title ?? '',
    url: h.url || discussion,
    at: h.created_at,
    summary: '',
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    discussion,
  };
}

const HN = 'https://hn.algolia.com/api/v1';

// Hacker News stories that mention someone and got attention: a good proxy for what a
// person posted elsewhere (X, their blog, YouTube) that people found important.
export async function hnMentions(query: string, minPoints = 80, days = 180): Promise<WebItem[]> {
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const params = new URLSearchParams({
    query: `"${query}"`,
    tags: 'story',
    numericFilters: `points>${minPoints},created_at_i>${since}`,
    hitsPerPage: '10',
  });
  const res = await fetch(`${HN}/search_by_date?${params}`);
  if (!res.ok) throw new Error(`hn ${res.status}`);
  return ((await res.json()) as { hits: Hit[] }).hits.filter((h) => h.title).map(hitToItem);
}

// The most discussed stories of the last days.
export async function hnTop(days = 7, minPoints = 400): Promise<WebItem[]> {
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const params = new URLSearchParams({
    tags: 'story',
    numericFilters: `points>${minPoints},created_at_i>${since}`,
    hitsPerPage: '30',
  });
  const res = await fetch(`${HN}/search?${params}`);
  if (!res.ok) throw new Error(`hn ${res.status}`);
  return ((await res.json()) as { hits: Hit[] }).hits
    .filter((h) => h.title)
    .map(hitToItem)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
}
