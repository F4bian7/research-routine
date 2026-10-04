/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backlinks, splitLinks, titleFrom } from './wikilinks';

test('links are split out of the text', () => {
  assert.deepEqual(splitLinks('See [[Dice loss]] and [[ k-space ]].'), [
    { text: 'See ' },
    { link: 'Dice loss' },
    { text: ' and ' },
    { link: 'k-space' },
    { text: '.' },
  ]);
  assert.deepEqual(splitLinks('plain'), [{ text: 'plain' }]);
});

test('backlinks ignore case and the note itself', () => {
  const notes = [
    { title: 'Dice loss', body: 'links [[dice loss]] to itself' },
    { title: 'nnU-Net', body: 'uses [[Dice Loss]]' },
    { title: 'Other', body: 'nothing' },
  ];
  assert.deepEqual(backlinks(notes, 'Dice loss').map((n) => n.title), ['nnU-Net']);
});

test('title from the first line', () => {
  assert.equal(titleFrom('\n  [[nnU-Net]] works  \nmore'), 'nnU-Net works');
  assert.equal(titleFrom(''), 'Untitled note');
});

test('the first line is not repeated under a title taken from it', async () => {
  const { bodyWithoutTitle } = await import('./wikilinks');
  assert.equal(bodyWithoutTitle('Idea [[x]]\nmore', 'Idea x'), 'more');
  assert.equal(bodyWithoutTitle('Other text', 'Title'), 'Other text');
});
