import type { Db } from '@/db/db';
import { getPaper } from '@/db/repos/papers';
import { listPeople } from '@/db/repos/people';
import { parsePaperLink } from '@/sources/links';
import { fetchWorkAuthors } from '@/sources/openalex';

// Topic and followed people for a note written about a paper.
export async function linksForPaper(
  db: Db,
  paperId: number
): Promise<{ topicIds: number[]; personIds: number[] }> {
  const paper = await getPaper(db, paperId);
  if (!paper) return { topicIds: [], personIds: [] };
  const [people, authors] = await Promise.all([
    listPeople(db),
    fetchWorkAuthors(parsePaperLink(paper.url)).catch(() => ({ ids: [] as string[], orcids: [] as string[] })),
  ]);
  const personIds = people
    .filter(
      (p) =>
        p.openalexIds.some((id) => authors.ids.includes(id)) ||
        (!!p.orcid && authors.orcids.includes(p.orcid))
    )
    .map((p) => p.id);
  return { topicIds: paper.topicId ? [paper.topicId] : [], personIds };
}
