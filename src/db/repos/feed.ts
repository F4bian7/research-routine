import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';

// What the user did with a feed item: liked, disliked (hidden) or saved to the backlog.
export type FeedDecision = 'up' | 'down' | 'saved';

export async function getFeedDecisions(db: Db): Promise<Map<string, FeedDecision>> {
  const rows = await db.getAllAsync<{ id: string; decision: FeedDecision }>(
    'SELECT id, decision FROM feed_seen'
  );
  return new Map(rows.map((r) => [r.id, r.decision]));
}

export async function setFeedDecision(db: Db, id: string, decision: FeedDecision | null) {
  if (decision === null) await db.runAsync('DELETE FROM feed_seen WHERE id = ?', id);
  else {
    await db.runAsync(
      'INSERT OR REPLACE INTO feed_seen (id, decision, at) VALUES (?, ?, ?)',
      id,
      decision,
      new Date().toISOString()
    );
  }
  notifyChange();
}
