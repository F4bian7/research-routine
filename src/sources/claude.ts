import type { Paper } from '@/db/types';
import { canonicalUrl, parsePaperLink } from './links';

// Hands a paper to Claude through the claude.ai "new chat" link, so follow-up questions
// run on the user's own Claude plan. claude.ai truncates the prompt at about 14,000
// characters, so the prompt carries the abstract and links, not the full text.
const MAX_PROMPT = 12_000;

export function claudePrompt(paper: Paper, abstract: string): string {
  const ref = parsePaperLink(paper.url);
  const lines = [
    'I am reading this paper and want to ask you questions about it.',
    '',
    `Title: ${paper.title}`,
  ];
  const byline = [paper.authors, paper.year].filter(Boolean).join(', ');
  if (byline) lines.push(`Authors: ${byline}`);
  if (paper.url) lines.push(`Link: ${canonicalUrl(ref)}`);
  if (ref.kind === 'arxiv') lines.push(`Full text (HTML): https://arxiv.org/html/${ref.id}`);
  if (abstract) lines.push('', 'Abstract:', abstract);
  lines.push(
    '',
    'Please read the full text from the link first if you can. Then give me a short overview ' +
      '(key idea, method, main result) and wait for my questions.'
  );
  return lines.join('\n').slice(0, MAX_PROMPT);
}

export function claudeUrl(paper: Paper, abstract: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(claudePrompt(paper, abstract))}`;
}
