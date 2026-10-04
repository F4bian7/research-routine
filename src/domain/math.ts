// Formulas in model text: $…$ or \(…\) inline, $$…$$ or \[…\] on their own line.
export type MathSegment = { text: string } | { math: string; display: boolean };

// JSON turns an unescaped "\frac" into a form feed plus "rac", "\theta" into a tab
// plus "heta", and so on. Inside formulas those control characters can only be such
// lost backslashes, so they are put back.
export function repairLatex(tex: string): string {
  return tex
    .replace(/\f/g, '\\f')
    .replace(/\x08/g, '\\b')
    .replace(/\t(?=[a-zA-Z])/g, '\\t')
    .replace(/\r(?=[a-zA-Z])/g, '\\r')
    .replace(/\n(?=(abla|eq|ot|u|i|ewline|orm|onumber)\b)/g, '\\n');
}

const PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

export function splitMath(input: string): MathSegment[] {
  const out: MathSegment[] = [];
  let last = 0;
  for (const m of input.matchAll(PATTERN)) {
    const [whole, dd, sq, par, single] = m;
    // "$5 and $10" is money, not maths: a lone $ followed by a digit and a space.
    if (single !== undefined && /^\d+([.,]\d+)?$/.test(single.trim())) continue;
    if (m.index! > last) out.push({ text: input.slice(last, m.index) });
    const tex = (dd ?? sq ?? par ?? single ?? '').trim();
    out.push({ math: repairLatex(tex), display: dd !== undefined || sq !== undefined });
    last = m.index! + whole.length;
  }
  if (last < input.length) out.push({ text: input.slice(last) });
  return out;
}

export function hasMath(input: string) {
  return splitMath(input).some((s) => 'math' in s);
}

// For places that cannot render maths: keep the formula readable as plain text.
export function mathAsText(input: string): string {
  return splitMath(input)
    .map((s) => ('text' in s ? s.text : s.math))
    .join('');
}

// Repairs invalid JSON escapes such as "\alpha" or "\sum" (a backslash before a letter
// JSON does not know), so a lesson with formulas still parses.
export function repairJsonEscapes(json: string): string {
  return json.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}
