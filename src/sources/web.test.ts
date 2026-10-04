/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFeed } from './web';

test('RSS items', () => {
  const xml = `<rss><channel><title>Blog</title>
    <item><title>Deep &amp; wide</title><link>/2026/post.html</link>
      <pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Some <b>text</b> &amp; more</p>]]></description></item>
    <item><title>No date</title><link>https://b.org/x</link></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'https://b.org/feed.xml');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Deep & wide');
  assert.equal(items[0].url, 'https://b.org/2026/post.html');
  assert.equal(items[0].summary, 'Some text & more');
  assert.equal(items[0].at, '2026-09-28T10:00:00.000Z');
});

test('Atom entries', () => {
  const xml = `<feed><entry><title type="html">Atom &lt;post&gt;</title>
    <link rel="alternate" href="https://s.net/2026/Oct/1/x/"/>
    <published>2026-10-01T08:00:00+00:00</published><summary>Short</summary></entry></feed>`;
  const [i] = parseFeed(xml, 'https://s.net/atom/');
  assert.equal(i.title, 'Atom <post>');
  assert.equal(i.url, 'https://s.net/2026/Oct/1/x/');
  assert.equal(i.summary, 'Short');
});

test('style blocks in post content do not end up in the summary', () => {
  const xml = `<feed><entry><title>microgpt</title><link href="https://k.dev/m"/>
    <updated>2026-02-01T00:00:00Z</updated>
    <content type="html">&lt;style&gt;.post h1 { font-size: 35px; }&lt;/style&gt;&lt;p&gt;A tiny GPT.&lt;/p&gt;</content></entry></feed>`;
  assert.equal(parseFeed(xml, 'https://k.dev/feed')[0].summary, 'A tiny GPT.');
});
