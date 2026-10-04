import type { Db } from '@/db/db';

import { DEFAULT_ROUTINE, DEFAULT_SETTINGS } from './defaults';
import type { PaperType } from './types';

// Seed rows are ordinary rows: editable and deletable like anything the user adds.
const TOPICS = [
  { name: 'Medizinische Bildsegmentierung', color: '#3B82F6' },
  { name: 'EEG und Seizure-Analyse', color: '#10B981' },
  { name: 'MRT-Physik und Rekonstruktion', color: '#F59E0B' },
];

// topic is an index into TOPICS.
const PAPERS: {
  title: string;
  authors: string;
  year: number;
  url: string;
  topic: number;
  type: PaperType;
}[] = [
  {
    title: 'A survey on deep learning in medical image analysis',
    authors: 'Litjens et al.',
    year: 2017,
    url: 'https://arxiv.org/abs/1702.05747',
    topic: 0,
    type: 'survey',
  },
  {
    title: 'U-Net: Convolutional Networks for Biomedical Image Segmentation',
    authors: 'Ronneberger, Fischer, Brox',
    year: 2015,
    url: 'https://arxiv.org/abs/1505.04597',
    topic: 0,
    type: 'milestone',
  },
  {
    title: 'nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation',
    authors: 'Isensee et al.',
    year: 2021,
    url: 'https://arxiv.org/abs/1809.10486',
    topic: 0,
    type: 'milestone',
  },
  {
    title: 'Segment Anything in Medical Images (MedSAM)',
    authors: 'Ma et al.',
    year: 2024,
    url: 'https://arxiv.org/abs/2304.12306',
    topic: 0,
    type: 'milestone',
  },
  {
    title: 'Deep learning-based electroencephalography analysis: a systematic review',
    authors: 'Roy et al.',
    year: 2019,
    url: 'https://arxiv.org/abs/1901.05498',
    topic: 1,
    type: 'survey',
  },
  {
    title: 'fastMRI: An Open Dataset and Benchmarks for Accelerated MRI',
    authors: 'Zbontar et al.',
    year: 2018,
    url: 'https://arxiv.org/abs/1811.08839',
    topic: 2,
    type: 'milestone',
  },
  {
    title: 'Learning a Variational Network for Reconstruction of Accelerated MRI Data',
    authors: 'Hammernik et al.',
    year: 2018,
    url: 'https://arxiv.org/abs/1704.00447',
    topic: 2,
    type: 'milestone',
  },
];

export async function seedIfEmpty(db: Db) {
  const done = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'seeded'"
  );
  if (done) return;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const topicIds: number[] = [];
    for (const t of TOPICS) {
      const r = await tx.runAsync('INSERT INTO topics (name, color) VALUES (?, ?)', t.name, t.color);
      topicIds.push(r.lastInsertRowId);
    }

    const now = new Date().toISOString();
    for (const [i, p] of PAPERS.entries()) {
      await tx.runAsync(
        `INSERT INTO papers (title, authors, year, url, topic_id, type, status, note, added_at, position)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', '', ?, ?)`,
        p.title,
        p.authors,
        p.year,
        p.url,
        topicIds[p.topic],
        p.type,
        now,
        i + 1
      );
    }

    for (const d of DEFAULT_ROUTINE) {
      await tx.runAsync(
        `INSERT OR REPLACE INTO day_tasks (weekday, title, description, duration_min, enabled, kind)
         VALUES (?, ?, ?, ?, ?, ?)`,
        d.weekday,
        d.title,
        d.description,
        d.durationMin,
        d.enabled ? 1 : 0,
        d.kind
      );
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.runAsync(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        key,
        JSON.stringify(value)
      );
    }

    // A marker instead of "topics is empty", so deleting every seed row does not re-seed.
    await tx.runAsync("INSERT INTO settings (key, value) VALUES ('seeded', 'true')");
  });
}
