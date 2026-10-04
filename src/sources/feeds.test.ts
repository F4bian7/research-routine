/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keywordQuery, parseKeywords } from '../domain/keywords';
import { parseHandles, toPost } from './bluesky';
import { dailyToFeedPaper } from './huggingface';
import { workToFeedPaper } from './openalex';

test('topic keywords become a boolean query', () => {
  const k = parseKeywords(' EEG seizure, nnU-Net ,, "accelerated MRI" scan ');
  assert.deepEqual(k, ['EEG seizure', 'nnU-Net', '"accelerated MRI" scan']);
  assert.equal(keywordQuery(k), '(EEG AND seizure) OR nnU-Net OR ("accelerated MRI" AND scan)');
  assert.equal(keywordQuery([]), '');
});

test('OpenAlex arXiv work maps to an arXiv feed paper', () => {
  const p = workToFeedPaper(
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.48550/arxiv.2610.01166',
      title: 'CineMR',
      publication_year: 2026,
      publication_date: '2026-10-01',
      authorships: [{ author: { display_name: 'A' } }],
      abstract_inverted_index: { Hello: [0] },
      primary_location: { source: { display_name: 'arXiv (Cornell University)' } },
    },
    3
  );
  assert.equal(p.id, 'arxiv:2610.01166');
  assert.equal(p.url, 'https://arxiv.org/abs/2610.01166');
  assert.equal(p.venue, 'arXiv');
  assert.equal(p.abstract, 'Hello');
  assert.equal(p.topicId, 3);
});

test('OpenAlex journal work keeps its DOI and venue', () => {
  const p = workToFeedPaper(
    { doi: 'https://doi.org/10.1002/HBM.1', title: 'T', primary_location: { source: { display_name: 'Human Brain Mapping' } } },
    null
  );
  assert.equal(p.id, 'doi:10.1002/hbm.1');
  assert.equal(p.url, 'https://doi.org/10.1002/HBM.1');
  assert.equal(p.venue, 'Human Brain Mapping');
});

test('Hugging Face daily paper', () => {
  const p = dailyToFeedPaper({
    paper: { id: '2609.22753', title: 'A\n title', summary: 'S', upvotes: 5, publishedAt: '2026-09-25T20:00:00Z', authors: [{ name: 'X' }] },
  });
  assert.equal(p.id, 'arxiv:2609.22753');
  assert.equal(p.title, 'A title');
  assert.equal(p.upvotes, 5);
  assert.equal(p.year, 2026);
});

test('Bluesky post finds the paper link in a facet', () => {
  const post = toPost({
    uri: 'at://did:plc:x/app.bsky.feed.post/abc',
    author: { did: 'did:plc:x', handle: 'bot.bsky.social' },
    record: {
      text: 'New paper arxiv.org/abs/2610…',
      createdAt: '2026-10-03T08:00:00Z',
      facets: [{ features: [{ uri: 'https://arxiv.org/abs/2610.01166' }] }],
    },
  });
  assert.equal(post.url, 'https://bsky.app/profile/bot.bsky.social/post/abc');
  assert.equal(post.paperUrl, 'https://arxiv.org/abs/2610.01166');
});

test('Bluesky handles from mixed input', () => {
  assert.deepEqual(parseHandles('@a.bsky.social, https://bsky.app/profile/b.org/ noise'), [
    'a.bsky.social',
    'b.org',
  ]);
});
