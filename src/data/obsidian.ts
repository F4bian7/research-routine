import type { Db } from '@/db/db';
import { listNotes } from '@/db/repos/notes';
import { listArchive, listQueued } from '@/db/repos/papers';
import { listPeople } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { Note, Paper, Person, Summary, Topic } from '@/db/types';
import { linkFor, LINK_LABEL } from '@/domain/person-links';
import { splitLinks } from '@/domain/wikilinks';
import { zip } from '@/domain/zip';

// Export as an Obsidian vault: one Markdown file per note, paper, person and topic,
// connected by [[links]] so Obsidian's graph and backlinks work out of the box.

export function safeName(name: string) {
  const s = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return (s.length > 80 ? s.slice(0, 80).trim() : s) || 'Untitled';
}

// Unique file names per folder; the same title twice gets " (2)".
function namer() {
  const used = new Set<string>();
  return (name: string) => {
    let n = safeName(name);
    let i = 2;
    while (used.has(n.toLowerCase())) n = `${safeName(name)} (${i++})`;
    used.add(n.toLowerCase());
    return n;
  };
}

const link = (file: string, label?: string) =>
  label && label !== file ? `[[${file}|${label}]]` : `[[${file}]]`;

function yaml(fields: Record<string, string | string[] | number | null | undefined>) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) =>
      Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}` : `${k}: ${JSON.stringify(v)}`
    );
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}

export type VaultInput = {
  notes: Note[];
  papers: Paper[];
  people: Person[];
  topics: Topic[];
  summaries: Map<number, Summary>;
};

export function buildVault(d: VaultInput): { path: string; content: string }[] {
  const noteName = namer();
  const paperName = namer();
  const personName = namer();
  const topicName = namer();
  const notes = new Map(d.notes.map((n) => [n.id, noteName(n.title)]));
  const papers = new Map(d.papers.map((p) => [p.id, paperName(p.title)]));
  const people = new Map(d.people.map((p) => [p.id, personName(p.name)]));
  const topics = new Map(d.topics.map((t) => [t.id, topicName(t.name)]));
  const noteByTitle = new Map(d.notes.map((n) => [n.title.trim().toLowerCase(), notes.get(n.id)!]));
  const files: { path: string; content: string }[] = [];

  for (const n of d.notes) {
    const body = splitLinks(n.body)
      .map((s) => {
        if ('text' in s) return s.text;
        const file = noteByTitle.get(s.link.toLowerCase());
        return file ? link(file, s.link) : `[[${s.link}]]`;
      })
      .join('');
    const content = [
      yaml({
        created: n.createdAt.slice(0, 10),
        updated: n.updatedAt.slice(0, 10),
        tags: n.topicIds.map((id) => topics.get(id)).filter((x): x is string => !!x).map((t) => t.replace(/\s+/g, '-')),
      }),
      `# ${n.title}\n\n`,
      n.quote ? `> ${n.quote.replace(/\n/g, '\n> ')}\n\n` : '',
      body ? `${body}\n\n` : '',
      n.paperId && papers.get(n.paperId) ? `Paper: ${link(papers.get(n.paperId)!)}\n` : '',
      n.personIds.length
        ? `People: ${n.personIds.map((id) => people.get(id)).filter((x): x is string => !!x).map((f) => link(f)).join(', ')}\n`
        : '',
      n.topicIds.length
        ? `Topics: ${n.topicIds.map((id) => topics.get(id)).filter((x): x is string => !!x).map((f) => link(f)).join(', ')}\n`
        : '',
    ].join('');
    files.push({ path: `Notes/${notes.get(n.id)}.md`, content });
  }

  for (const p of d.papers) {
    const s = d.summaries.get(p.id);
    const own = d.notes.filter((n) => n.paperId === p.id);
    const content = [
      yaml({
        authors: p.authors,
        year: p.year,
        url: p.url,
        status: p.status,
        rating: p.rating,
        read: p.readAt?.slice(0, 10),
        tags: p.topicId && topics.get(p.topicId) ? [topics.get(p.topicId)!.replace(/\s+/g, '-')] : [],
      }),
      `# ${p.title}\n\n`,
      p.topicId && topics.get(p.topicId) ? `Topic: ${link(topics.get(p.topicId)!)}\n\n` : '',
      p.note ? `## My note\n\n${p.note}\n\n` : '',
      s
        ? `## Explained simply\n\n${s.short}\n\n${[
            ['Problem', s.problem],
            ['Approach', s.method],
            ['Result', s.result],
            ['Why it matters', s.relevance],
            ['Limits', s.limits],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => `**${k}.** ${v}`)
            .join('\n\n')}\n\n${s.terms.length ? `**Terms.**\n${s.terms.map((t) => `- ${t.term}: ${t.explanation}`).join('\n')}\n\n` : ''}`
        : '',
      own.length ? `## Notes\n\n${own.map((n) => `- ${link(notes.get(n.id)!)}`).join('\n')}\n` : '',
    ].join('');
    files.push({ path: `Papers/${papers.get(p.id)}.md`, content });
  }

  for (const p of d.people) {
    const links = (Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[])
      .filter((k) => p.links[k])
      .map((k) => `- [${LINK_LABEL[k]}](${linkFor(k, p.links[k]!)})`);
    const content = [
      yaml({ institution: p.institution, orcid: p.orcid }),
      `# ${p.name}\n\n`,
      p.topicIds.length
        ? `Topics: ${p.topicIds.map((id) => topics.get(id)).filter((x): x is string => !!x).map((f) => link(f)).join(', ')}\n\n`
        : '',
      links.length ? `${links.join('\n')}\n` : '',
    ].join('');
    files.push({ path: `People/${people.get(p.id)}.md`, content });
  }

  for (const t of d.topics) {
    files.push({
      path: `Topics/${topics.get(t.id)}.md`,
      content: `${yaml({ keywords: t.keywords })}# ${t.name}\n`,
    });
  }
  return files;
}

export async function exportVault(db: Db): Promise<Uint8Array> {
  const [notes, queued, read, people, topics, rows] = await Promise.all([
    listNotes(db),
    listQueued(db),
    listArchive(db),
    listPeople(db),
    listTopics(db),
    db.getAllAsync<{ paper_id: number; json: string }>('SELECT paper_id, json FROM summaries'),
  ]);
  const summaries = new Map(rows.map((r) => [r.paper_id, JSON.parse(r.json) as Summary]));
  return zip(buildVault({ notes, papers: [...queued, ...read], people, topics, summaries }));
}
