import type { Db } from '@/db/db';

import type { Paper, PaperStatus, PaperType, Rating } from '../types';

type Row = {
  id: number;
  title: string;
  authors: string;
  year: number | null;
  url: string;
  topic_id: number | null;
  type: string;
  status: string;
  rating: string | null;
  note: string;
  added_at: string;
  read_at: string | null;
  position: number;
};

function fromRow(r: Row): Paper {
  return {
    id: r.id,
    title: r.title,
    authors: r.authors,
    year: r.year,
    url: r.url,
    topicId: r.topic_id,
    type: r.type as PaperType,
    status: r.status as PaperStatus,
    rating: r.rating as Rating,
    note: r.note,
    addedAt: r.added_at,
    readAt: r.read_at,
    position: r.position,
  };
}

// The item at the head of the queue, optionally restricted to some paper types.
export async function topQueued(
  db: Db,
  types?: PaperType[]
): Promise<Paper | null> {
  const filter = types?.length ? `AND type IN (${types.map(() => '?').join(', ')})` : '';
  const row = await db.getFirstAsync<Row>(
    `SELECT * FROM papers WHERE status = 'queued' ${filter} ORDER BY position LIMIT 1`,
    ...(types ?? [])
  );
  return row ? fromRow(row) : null;
}
