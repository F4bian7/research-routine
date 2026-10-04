/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newPerson } from '../db/repos/people';
import type { Note, Paper } from '../db/types';
import { buildVault, safeName } from './obsidian';

const note = (n: Partial<Note> & { id: number; title: string }): Note => ({
  body: '',
  quote: '',
  paperId: null,
  topicIds: [],
  personIds: [],
  createdAt: '2026-10-04T10:00:00Z',
  updatedAt: '2026-10-04T10:00:00Z',
  ...n,
});

test('file names are safe', () => {
  assert.equal(safeName('a/b: c?'), 'a-b- c-');
  assert.equal(safeName('   '), 'Untitled');
});

test('vault links notes, papers, people and topics', () => {
  const paper: Paper = {
    id: 7, title: 'U-Net: CNNs', authors: 'R', year: 2015, url: 'https://arxiv.org/abs/1505.04597', topicId: 1,
    type: 'milestone', status: 'read', rating: 'up', note: 'classic', addedAt: '', readAt: '2026-10-01T00:00:00Z', position: 1,
  };
  const files = buildVault({
    notes: [
      note({ id: 1, title: 'Skip connections', body: 'See [[dice loss]] and [[Missing]]', quote: 'q1\nq2', paperId: 7, topicIds: [1], personIds: [3] }),
      note({ id: 2, title: 'Dice loss' }),
    ],
    papers: [paper],
    people: [{ id: 3, ...newPerson({ name: 'Olaf Ronneberger', topicIds: [1] }) }],
    topics: [{ id: 1, name: 'Medical image segmentation', color: '', keywords: 'x', goal: '' }],
    summaries: new Map(),
  });
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  assert.deepEqual([...byPath.keys()].sort(), [
    'Notes/Dice loss.md',
    'Notes/Skip connections.md',
    'Papers/U-Net- CNNs.md',
    'People/Olaf Ronneberger.md',
    'Topics/Medical image segmentation.md',
  ]);
  const n = byPath.get('Notes/Skip connections.md')!;
  assert.match(n, /\[\[Dice loss\|dice loss\]\]/);
  assert.match(n, /\[\[Missing\]\]/);
  assert.match(n, /> q1\n> q2/);
  assert.match(n, /Paper: \[\[U-Net- CNNs\]\]/);
  assert.match(n, /People: \[\[Olaf Ronneberger\]\]/);
  assert.match(n, /tags:\n {2}- "Medical-image-segmentation"/);
  assert.match(byPath.get('Papers/U-Net- CNNs.md')!, /## Notes\n\n- \[\[Skip connections\]\]/);
});
