/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePaperLink } from './links';
import { rebuildAbstract } from './openalex';

test('arXiv links in all shapes', () => {
  for (const s of [
    'https://arxiv.org/abs/2304.12306',
    'https://arxiv.org/pdf/2304.12306v3',
    'https://arxiv.org/html/2304.12306v2#S1',
    'arXiv:2304.12306',
    '2304.12306',
    'https://doi.org/10.48550/arXiv.2304.12306',
  ]) {
    assert.deepEqual(parsePaperLink(s), { kind: 'arxiv', id: '2304.12306' }, s);
  }
});

test('DOI links', () => {
  assert.deepEqual(parsePaperLink('https://doi.org/10.1038/s41592-020-01008-z'), {
    kind: 'doi',
    doi: '10.1038/s41592-020-01008-z',
  });
  assert.deepEqual(parsePaperLink('https://www.nature.com/articles/10.1038/nmeth.1234?x=1'), {
    kind: 'doi',
    doi: '10.1038/nmeth.1234',
  });
});

test('other links stay URLs', () => {
  assert.deepEqual(parsePaperLink('https://example.org/paper'), {
    kind: 'url',
    url: 'https://example.org/paper',
  });
});

test('abstract from inverted index', () => {
  assert.equal(rebuildAbstract({ world: [1], hello: [0], again: [2] }), 'hello world again');
});

test('arXiv metadata from the HTML rendering', async () => {
  const { arxivMetaFromHtml } = await import('./arxiv');
  const html = `<h1 class="ltx_title ltx_title_document">A Survey on <em>Deep</em> Learning</h1>
    <span class="ltx_personname">Geert Litjens, Thijs Kooi, <br class="ltx_break">Clara Sánchez</span>
    <div class="ltx_abstract"><h6 class="ltx_title">Abstract</h6><p class="ltx_p">Deep learning works.</p></div>`;
  assert.deepEqual(arxivMetaFromHtml('1702.05747', html), {
    title: 'A Survey on Deep Learning',
    authors: 'Geert Litjens et al.',
    year: 2017,
    abstract: 'Deep learning works.',
    venue: 'arXiv',
  });
});
