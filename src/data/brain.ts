import type { Db } from '@/db/db';
import { addNote, listNotes } from '@/db/repos/notes';
import { getPaper } from '@/db/repos/papers';
import { getSummary } from '@/db/repos/summaries';
import type { Lesson, Paper, Summary } from '@/db/types';
import { fetchArxivHtml, arxivMetaFromHtml } from '@/sources/arxiv';
import type { FeedPaper } from '@/sources/feed-types';
import { parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';
import { type SuggestedNote, suggestNotes } from '@/sources/note-suggestions';
import { readerProfile } from './briefs';
import { saveFeedPaper } from './save-paper';
import { getGemini, markPaperRead } from './learn';
import { linksForPaper } from './notes';

// Something the learner is reading and wants in the second brain.
export type BrainSource = {
  kind: string; // e.g. "paper", "Hacker News story", "lesson"
  title: string;
  text: string; // what the notes are drafted from
  url?: string;
  paperId?: number | null; // a paper already in the library
  feedPaper?: FeedPaper; // a paper from a feed, saved to the library when notes are kept
  topicId?: number | null;
  lesson?: Lesson; // a paper explained in a session: it goes to the library when notes are kept
};

// Handing a source to the suggestion screen without squeezing it into the URL. A loader
// lets the screen show progress while the text is fetched.
export type SourceLoader = (db: Db) => Promise<BrainSource>;
let pending: SourceLoader | null = null;
export function setPendingSource(s: BrainSource | SourceLoader) {
  pending = typeof s === 'function' ? s : async () => s;
}
export function pendingSource(): SourceLoader | null {
  return pending;
}

// The text of a session: the paper's explanation, key points and everything explored.
export function lessonSource(blocks: Lesson[]): BrainSource {
  const root = blocks[0];
  const text = blocks
    .map((b) =>
      [
        b === root ? '' : `${b.kind === 'question' ? 'Question' : 'Explored'}: ${b.title}`,
        b.content?.body ?? '',
        b.content?.keyPoints.length ? `Key points:\n${b.content.keyPoints.map((k) => `- ${k}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
  return {
    kind: root.kind === 'paper' ? 'paper, explained by a tutor' : 'lesson',
    title: root.title,
    text,
    url: root.paperUrl || undefined,
    topicId: root.topicId,
    lesson: root.kind === 'paper' && root.paperUrl ? root : undefined,
  };
}

function summaryText(s: Summary | null) {
  if (!s) return '';
  return [s.short, s.problem, s.method, s.result, s.relevance, s.limits].filter(Boolean).join('\n');
}

// The text to draft notes from for a library paper: the explanation the learner saw if
// there is one, plus the abstract or the arXiv full text.
export async function paperSource(db: Db, paper: Paper): Promise<BrainSource> {
  const ref = parsePaperLink(paper.url);
  let text = '';
  if (ref.kind === 'arxiv') {
    const html = await fetchArxivHtml(ref.id).catch(() => null);
    if (html) {
      const abs = arxivMetaFromHtml(ref.id, html.html).abstract;
      text = `${abs}\n\n${html.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20_000)}`;
    }
  }
  if (!text) text = (await fetchMeta(ref).catch(() => null))?.abstract ?? '';
  const summary = summaryText(await getSummary(db, paper.id));
  return {
    kind: 'paper',
    title: paper.title,
    text: [summary && `Plain-language summary:\n${summary}`, text, paper.note && `My note: ${paper.note}`]
      .filter(Boolean)
      .join('\n\n'),
    url: paper.url,
    paperId: paper.id,
    topicId: paper.topicId,
  };
}

export async function suggestFor(db: Db, source: BrainSource): Promise<SuggestedNote[]> {
  const g = await getGemini(db, 'quality');
  if (!g) throw new Error('Add the free Gemini key in Settings first.');
  const [notes, profile] = await Promise.all([listNotes(db), readerProfile(db)]);
  return suggestNotes(g, source, { profile, existingTitles: notes.map((n) => n.title) });
}

// Saves the kept notes, linked to the paper (saved to the library first if it came from
// a feed), its topic and the followed people who wrote it.
export async function keepNotes(db: Db, source: BrainSource, notes: SuggestedNote[]): Promise<number[]> {
  let paperId = source.paperId ?? null;
  if (!paperId && source.feedPaper) paperId = await saveFeedPaper(db, source.feedPaper);
  if (!paperId && source.lesson) paperId = await markPaperRead(db, source.lesson);
  const links = paperId ? await linksForPaper(db, paperId) : { topicIds: [], personIds: [] };
  const paper = paperId ? await getPaper(db, paperId) : null;
  const topicIds = links.topicIds.length ? links.topicIds : source.topicId ? [source.topicId] : [];
  const ids: number[] = [];
  for (const n of notes) {
    const body = !paperId && source.url ? `${n.body}\n\nSource: ${source.url}` : n.body;
    ids.push(
      await addNote(db, {
        title: n.title,
        body,
        quote: '',
        paperId: paper?.id ?? null,
        topicIds,
        personIds: links.personIds,
      })
    );
  }
  return ids;
}
