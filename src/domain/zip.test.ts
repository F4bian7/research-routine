/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { crc32, zip } from './zip';

test('crc32 of a known string', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('the archive opens with a standard unzip and keeps UTF-8 content', () => {
  const bytes = zip([
    { path: 'Notes/Dice loss.md', content: '# Dice\n[[nnU-Net]] ü' },
    { path: 'Papers/U-Net.md', content: 'x' },
  ]);
  const file = join(mkdtempSync(join(tmpdir(), 'zip-')), 'a.zip');
  writeFileSync(file, bytes);
  const out = execFileSync('python3', [
    '-c',
    'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(z.read("Notes/Dice loss.md").decode())',
    file,
  ]).toString();
  assert.equal(out.trim(), '# Dice\n[[nnU-Net]] ü');
});
