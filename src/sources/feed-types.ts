// A paper shown in a feed before it is in the backlog.
export type FeedPaper = {
  id: string; // stable across fetches, e.g. "arxiv:2610.01166" or "doi:10.1000/x"
  title: string;
  authors: string;
  year: number | null;
  date: string; // YYYY-MM-DD
  url: string;
  abstract: string;
  venue: string;
  topicId: number | null;
  upvotes?: number;
  authorIds?: string[]; // OpenAlex author ids, for the people timeline
};

export type BlueskyPost = {
  uri: string;
  url: string; // bsky.app link
  author: string;
  handle: string;
  avatar?: string;
  text: string;
  createdAt: string;
  link?: { uri: string; title: string; description: string; thumb?: string };
  image?: string;
  paperUrl?: string; // first arXiv or DOI link in the post, if any
};
