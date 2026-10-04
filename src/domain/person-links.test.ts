/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blueskyHandle, linkFor } from './person-links';

test('links from handles or URLs', () => {
  assert.equal(linkFor('bluesky', '@ana.bsky.social'), 'https://bsky.app/profile/ana.bsky.social');
  assert.equal(linkFor('x', 'ana_ml'), 'https://x.com/ana_ml');
  assert.equal(linkFor('website', 'ana.org'), 'https://ana.org');
  assert.equal(linkFor('scholar', 'https://scholar.google.com/citations?user=1'), 'https://scholar.google.com/citations?user=1');
  assert.equal(linkFor('x', '  '), '');
});

test('Bluesky handle from input', () => {
  assert.equal(blueskyHandle('https://bsky.app/profile/ana.bsky.social'), 'ana.bsky.social');
  assert.equal(blueskyHandle('@ana.bsky.social'), 'ana.bsky.social');
  assert.equal(blueskyHandle('ana'), null);
  assert.equal(blueskyHandle(undefined), null);
});
