// Notes link to each other with [[Title of the other note]], as in Obsidian.
export type Segment = { text: string } | { link: string };

export function splitLinks(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ link: m[1].trim() });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export function linkTargets(body: string): string[] {
  return splitLinks(body)
    .filter((s): s is { link: string } => 'link' in s)
    .map((s) => s.link);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findByTitle<T extends { title: string }>(items: T[], title: string): T | undefined {
  return items.find((n) => same(n.title, title));
}

// Notes whose text links to `title`.
export function backlinks<T extends { title: string; body: string }>(items: T[], title: string): T[] {
  return items.filter((n) => !same(n.title, title) && linkTargets(n.body).some((t) => same(t, title)));
}

// A title from the first line when the user did not give one.
export function titleFrom(text: string, fallback = 'Untitled note'): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const t = line.replace(/\[\[|\]\]/g, '');
  return (t.length > 80 ? `${t.slice(0, 77)}…` : t) || fallback;
}

// When the title was taken from the first line, do not show that line twice.
export function bodyWithoutTitle(body: string, title: string): string {
  const lines = body.split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first >= 0 && titleFrom(lines[first]) === title) {
    return lines.slice(first + 1).join('\n').trim();
  }
  return body;
}
