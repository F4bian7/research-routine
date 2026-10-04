import type { BlueskyPost } from './feed-types';

// Bluesky's public AppView: no login, CORS enabled.
const API = 'https://api.bsky.app/xrpc';

type PostView = {
  uri: string;
  author: { handle: string; displayName?: string; avatar?: string };
  record: {
    text?: string;
    createdAt?: string;
    facets?: { features?: { $type?: string; uri?: string }[] }[];
  };
  embed?: {
    $type?: string;
    external?: { uri: string; title?: string; description?: string; thumb?: string };
    images?: { thumb?: string }[];
    media?: PostView['embed'];
  };
  indexedAt?: string;
};

export function toPost(p: PostView): BlueskyPost {
  const rkey = p.uri.split('/').pop();
  const embed = p.embed?.media ?? p.embed;
  const ext = embed?.external;
  return {
    uri: p.uri,
    url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
    author: p.author.displayName || p.author.handle,
    handle: p.author.handle,
    avatar: p.author.avatar,
    text: p.record.text ?? '',
    createdAt: p.record.createdAt ?? p.indexedAt ?? '',
    link: ext
      ? { uri: ext.uri, title: ext.title ?? '', description: ext.description ?? '', thumb: ext.thumb }
      : undefined,
    image: embed?.images?.[0]?.thumb,
    paperUrl: findPaperLink(p, ext?.uri),
  };
}

const PAPER_LINK = /(arxiv\.org\/(abs|pdf|html)\/|doi\.org\/10\.)/i;

// Bots often put the arXiv link in the text (a facet) instead of a link card.
function findPaperLink(p: PostView, cardUri?: string): string | undefined {
  const facetUris = (p.record.facets ?? []).flatMap((f) =>
    (f.features ?? []).map((x) => x.uri ?? '')
  );
  const textUris = (p.record.text ?? '').match(/https?:\/\/\S+/g) ?? [];
  return [cardUri ?? '', ...facetUris, ...textUris].find((u) => PAPER_LINK.test(u));
}

async function get<T>(method: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${method}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Bluesky ${res.status}`);
  return (await res.json()) as T;
}

// Posts that link to arXiv and match the query, newest first.
export async function searchPaperPosts(query: string): Promise<BlueskyPost[]> {
  const data = await get<{ posts: PostView[] }>('app.bsky.feed.searchPosts', {
    q: query,
    domain: 'arxiv.org',
    sort: 'latest',
    limit: '40',
  });
  return data.posts.map(toPost);
}

// "https://bsky.app/profile/<handle or did>/lists/<rkey>" -> list AT-URI.
async function listUri(url: string): Promise<string | null> {
  const m = url.match(/bsky\.app\/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (!m) return null;
  let did = m[1];
  if (!did.startsWith('did:')) {
    did = (await get<{ did: string }>('com.atproto.identity.resolveHandle', { handle: did })).did;
  }
  return `at://${did}/app.bsky.graph.list/${m[2]}`;
}

export function parseHandles(source: string): string[] {
  return source
    .split(/[\s,]+/)
    .map((h) => h.replace(/^@/, '').replace(/^https:\/\/bsky\.app\/profile\//, '').replace(/\/$/, ''))
    .filter((h) => h.includes('.'));
}

// The user's own source: one list URL, or a set of accounts merged by time.
export async function followedPosts(source: string): Promise<BlueskyPost[]> {
  const list = await listUri(source.trim());
  if (list) {
    const data = await get<{ feed: { post: PostView }[] }>('app.bsky.feed.getListFeed', {
      list,
      limit: '50',
    });
    return data.feed.map((f) => toPost(f.post));
  }
  const feeds = await Promise.all(
    parseHandles(source).map((actor) =>
      get<{ feed: { post: PostView }[] }>('app.bsky.feed.getAuthorFeed', {
        actor,
        limit: '20',
        filter: 'posts_no_replies',
      }).catch(() => ({ feed: [] }))
    )
  );
  return feeds
    .flatMap((f) => f.feed.map((x) => toPost(x.post)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
