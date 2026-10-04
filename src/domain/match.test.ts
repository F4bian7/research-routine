/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchTopics, nameMatches } from './match';

test('Bluesky name check', () => {
  assert.ok(nameMatches('Fabian Isensee', 'Fabian Isensee', 'fisensee.bsky.social'));
  assert.ok(nameMatches('Clara Sánchez', 'clara sanchez'));
  assert.ok(!nameMatches('Fabian Isensee', 'Fabian Hoffmann, PhD'));
  assert.ok(!nameMatches('', 'anyone'));
});

test('topics from paper titles', () => {
  const topics = [
    { id: 1, name: 'Seg', color: '', keywords: 'medical image segmentation, nnU-Net', goal: '' },
    { id: 2, name: 'EEG', color: '', keywords: 'EEG seizure, "seizure detection"', goal: '' },
  ];
  const texts = [
    'nnU-Net revisited',
    'Medical image segmentation with transformers',
    'A seizure detection benchmark',
  ];
  assert.deepEqual(matchTopics(topics, texts), [1]);
  assert.deepEqual(matchTopics(topics, texts, 1), [1, 2]);
});
