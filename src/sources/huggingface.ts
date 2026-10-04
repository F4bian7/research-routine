import type { FeedPaper } from './feed-types';
import { formatAuthors } from './openalex';

// Hugging Face Daily Papers: community-picked arXiv papers with upvotes (CORS enabled).
type DailyPaper = {
  publishedAt?: string;
  paper: {
    id: string; // arXiv id
    title: string;
    summary?: string;
    upvotes?: number;
    publishedAt?: string;
    authors?: { name: string }[];
  };
};

export function dailyToFeedPaper(d: DailyPaper): FeedPaper {
  const p = d.paper;
  const date = (p.publishedAt ?? d.publishedAt ?? '').slice(0, 10);
  return {
    id: `arxiv:${p.id}`,
    title: p.title.replace(/\s+/g, ' ').trim(),
    authors: formatAuthors((p.authors ?? []).map((a) => a.name)),
    year: date ? Number(date.slice(0, 4)) : null,
    date,
    url: `https://arxiv.org/abs/${p.id}`,
    abstract: (p.summary ?? '').replace(/\s+/g, ' ').trim(),
    venue: 'Hugging Face Daily Papers',
    topicId: null,
    upvotes: p.upvotes ?? 0,
  };
}

// The latest daily list, most upvoted first.
export async function fetchTrending(): Promise<FeedPaper[]> {
  const res = await fetch('https://huggingface.co/api/daily_papers?limit=50');
  if (!res.ok) throw new Error(`Hugging Face ${res.status}`);
  const data = (await res.json()) as DailyPaper[];
  return data.map(dailyToFeedPaper).sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));
}
