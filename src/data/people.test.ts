/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newPerson } from '../db/repos/people';
import type { AuthorProfile } from '../db/types';
import { normalizeName } from '../domain/match';
import { likelySame, paperBelongsTo } from './people';

const profile = (p: Partial<AuthorProfile> & { id: string; name: string }): AuthorProfile => ({
  institutions: [],
  works: 1,
  citations: 0,
  topic: '',
  orcid: null,
  ...p,
});

test('names compare without accents, case and dots', () => {
  assert.equal(normalizeName('Florian Knöll'), normalizeName('florian knoll'));
  assert.equal(normalizeName('B. Van Ginneken'), 'b van ginneken');
});

test('split profiles of one person are proposed together', () => {
  const main = profile({ id: 'A1', name: 'Florian Knöll', institutions: ['FAU'], orcid: 'o1', works: 181 });
  const others = [
    profile({ id: 'A2', name: 'Florian Knoll', institutions: [] }), // same name, no institution
    profile({ id: 'A3', name: 'Florian Knoll', institutions: ['Elsewhere'] }), // other place
    profile({ id: 'A4', name: 'F. Knoll', institutions: ['NYU'], orcid: 'o1' }), // same ORCID
    profile({ id: 'A5', name: 'Florian Kroll', institutions: ['FAU'] }), // other name
  ];
  assert.deepEqual(likelySame(main, others), ['A2', 'A4']);
});

test('a paper belongs to a person by any profile or the ORCID', () => {
  const person = { id: 1, ...newPerson({ name: 'X', openalexIds: ['A1', 'A2'], orcid: 'o1' }) };
  const paper = { id: 'p', title: '', authors: '', year: null, date: '', url: '', abstract: '', venue: '', topicId: null };
  assert.ok(paperBelongsTo({ ...paper, authorIds: ['A9', 'A2'] }, person));
  assert.ok(paperBelongsTo({ ...paper, authorIds: ['A9'], authorOrcids: ['o1'] }, person));
  assert.ok(!paperBelongsTo({ ...paper, authorIds: ['A9'] }, person));
});
