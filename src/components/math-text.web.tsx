import { useEffect, useState } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { splitMath } from '@/domain/math';

// Formulas are rendered by KaTeX as MathML, which Safari draws natively (no extra fonts
// or styles). KaTeX ships in public/katex and is loaded only when a formula appears.

type Katex = {
  renderToString: (tex: string, opts: { displayMode: boolean; output: 'mathml'; throwOnError: boolean }) => string;
};

declare global {
  interface Window {
    katex?: Katex;
  }
}

let loading: Promise<Katex | null> | null = null;

function loadKatex(): Promise<Katex | null> {
  if (window.katex) return Promise.resolve(window.katex);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `${process.env.EXPO_BASE_URL ?? ''}/katex/katex.min.js`;
    s.onload = () => resolve(window.katex ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function toHtml(text: string, katex: Katex | null): string {
  return splitMath(text)
    .map((seg) => {
      if ('text' in seg) return escapeHtml(seg.text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      if (!katex) return `<code>${escapeHtml(seg.math)}</code>`;
      const math = katex.renderToString(seg.math, { displayMode: seg.display, output: 'mathml', throwOnError: false });
      return seg.display
        ? `<span style="display:block;overflow-x:auto;margin:6px 0;font-size:1.1em">${math}</span>`
        : math;
    })
    .join('');
}

export function MathText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const plain = !/[$\\]|\*\*/.test(text);
  const [katex, setKatex] = useState<Katex | null>(window.katex ?? null);
  useEffect(() => {
    if (plain || katex) return;
    let alive = true;
    loadKatex().then((k) => alive && setKatex(k));
    return () => {
      alive = false;
    };
  }, [plain, katex]);

  if (plain) return <ThemedText style={style}>{text}</ThemedText>;
  return (
    <ThemedText style={style}>
      <span dangerouslySetInnerHTML={{ __html: toHtml(text, katex) }} />
    </ThemedText>
  );
}
