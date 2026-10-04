import type { Db } from '@/db/db';
import { setFeedDecision } from '@/db/repos/feed';
import { addPaper, findPaperByUrl } from '@/db/repos/papers';
import type { FeedPaper } from '@/sources/feed-types';
import { canonicalUrl, parsePaperLink } from '@/sources/links';

// Puts a feed paper into the backlog (once) and returns its id.
export async function saveFeedPaper(db: Db, p: FeedPaper): Promise<number> {
  const url = canonicalUrl(parsePaperLink(p.url));
  const existing = await findPaperByUrl(db, url);
  const id =
    existing?.id ??
    (await addPaper(db, {
      title: p.title,
      url,
      authors: p.authors,
      year: p.year,
      topicId: p.topicId,
      type: 'other',
    }));
  await setFeedDecision(db, p.id, 'saved');
  return id;
}
