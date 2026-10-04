import { type MouseEvent, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SummarySection } from '@/components/summary-section';
import { ThemedText } from '@/components/themed-text';
import { Chip, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Paper } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { fetchArxivHtml } from '@/sources/arxiv';
import { parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';

// Web reader: arXiv's HTML rendering, sanitised and restyled for the phone.
// "Kurz" follows the routine (abstract, figures, conclusion); "Volltext" is everything.

type Parsed = {
  abstract: string;
  figures: string[];
  conclusion: string;
  full: string;
  plain: string; // text for the summary, without the bibliography
};

const DROP = 'script, style, link, meta, iframe, object, embed, form, input, button, noscript, nav';

function sanitize(root: Element, base: string) {
  root.querySelectorAll(DROP).forEach((e) => e.remove());
  root.querySelectorAll('*').forEach((el) => {
    const inMath = !!el.closest('math, svg');
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (name === 'style' && !inMath)) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' || name === 'src' || name === 'xlink:href') {
        const v = attr.value.trim();
        if (/^javascript:/i.test(v)) el.removeAttribute(attr.name);
        else if (!v.startsWith('#') && !v.startsWith('data:')) {
          try {
            el.setAttribute(attr.name, new URL(v, base).href);
          } catch {
            el.removeAttribute(attr.name); // malformed link in the source
          }
        }
      }
    }
  });
  root.querySelectorAll('a[href]').forEach((a) => {
    if (!a.getAttribute('href')!.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  root.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
}

function parseArxiv(html: string, base: string): Parsed | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = doc.querySelector('article.ltx_document') ?? doc.querySelector('.ltx_document');
  if (!article) return null;
  sanitize(article, base);
  article
    .querySelectorAll('.ltx_title_document, .ltx_authors, .ltx_dates, .ltx_page_footer')
    .forEach((e) => e.remove());

  const abstractEl = article.querySelector('.ltx_abstract');
  const abstract = abstractEl
    ? [...abstractEl.querySelectorAll('p')].map((p) => p.outerHTML).join('')
    : '';

  const figures = [...article.querySelectorAll('figure.ltx_figure')]
    .filter((f) => !f.parentElement?.closest('figure.ltx_figure'))
    .filter((f) => f.querySelector('img'))
    .map((f) => f.outerHTML);

  const sections = [...article.querySelectorAll('section.ltx_section')];
  const heading = (s: Element) => s.querySelector('h2')?.textContent ?? '';
  const conclusionEl =
    sections.filter((s) => /conclu/i.test(heading(s))).pop() ??
    sections.filter((s) => /summary|discussion|outlook/i.test(heading(s))).pop();
  const conclusion = conclusionEl?.outerHTML ?? '';

  const textCopy = article.cloneNode(true) as Element;
  textCopy.querySelectorAll('.ltx_bibliography, figure, table').forEach((e) => e.remove());
  const plain = (textCopy.textContent ?? '').replace(/\s+/g, ' ').trim();

  return { abstract, figures, conclusion, full: article.innerHTML, plain };
}

function css(text: string, secondary: string, accent: string, border: string) {
  return `
.rr-reader { color: ${text}; font-family: -apple-system, system-ui, sans-serif; font-size: 17px; line-height: 1.6; overflow-wrap: break-word; }
.rr-reader p { margin: 0 0 0.9em; }
.rr-reader h2, .rr-reader h3, .rr-reader h4 { line-height: 1.3; margin: 1.4em 0 0.5em; }
.rr-reader h2 { font-size: 21px; } .rr-reader h3 { font-size: 18px; } .rr-reader h4 { font-size: 17px; }
.rr-reader a { color: ${accent}; }
.rr-reader img { max-width: 100%; height: auto; background: #fff; border-radius: 6px; }
.rr-reader figure { margin: 1.2em 0; max-width: 100%; }
.rr-reader figure figure { display: inline-block; max-width: 100%; margin: 0.3em 0; }
.rr-reader figcaption { color: ${secondary}; font-size: 15px; line-height: 1.45; margin-top: 0.4em; }
.rr-reader table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; font-size: 14px; }
.rr-reader td, .rr-reader th { padding: 2px 6px; }
.rr-reader math[display="block"], .rr-reader .ltx_equation, .rr-reader .ltx_equationgroup { display: block; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
.rr-reader .ltx_bibliography { font-size: 14px; color: ${secondary}; }
.rr-reader .ltx_bibliography li { margin-bottom: 0.5em; }
.rr-reader .ltx_tag_equation { color: ${secondary}; }
.rr-reader hr { border: none; border-top: 1px solid ${border}; }
.rr-reader .ltx_note_outer { display: none; }
`;
}

// In-page anchors (#S2, citations) scroll inside the reader instead of changing the route.
function onAnchorClick(e: MouseEvent<HTMLDivElement>) {
  const a = (e.target as HTMLElement).closest('a');
  const href = a?.getAttribute('href');
  if (!href?.startsWith('#')) return;
  e.preventDefault();
  document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' });
}

function Html({ html }: { html: string }) {
  return <div className="rr-reader" onClick={onAnchorClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function PaperContent({ paper }: { paper: Paper }) {
  const theme = useTheme();
  const [mode, setMode] = useState<'short' | 'full'>('short');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [abstract, setAbstract] = useState('');
  const [state, setState] = useState<'loading' | 'done' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    const ref = parsePaperLink(paper.url);
    const meta = fetchMeta(ref).catch((e: unknown) => {
      console.error('metadata failed', e);
      return null;
    });
    const full =
      ref.kind === 'arxiv'
        ? fetchArxivHtml(ref.id)
            .then((f) => (f ? parseArxiv(f.html, f.baseUrl) : null))
            .catch((e: unknown) => {
              console.error('full text failed', e);
              return null;
            })
        : Promise.resolve(null);
    Promise.all([meta, full]).then(([m, p]) => {
      if (!alive) return;
      setAbstract(m?.abstract ?? '');
      setParsed(p);
      setState(m || p ? 'done' : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [paper.url]);

  const style = <style>{css(theme.text, theme.textSecondary, theme.accent, theme.border)}</style>;

  if (state === 'loading') {
    return <ThemedText themeColor="textSecondary">Lädt …</ThemedText>;
  }
  if (state === 'failed') {
    return (
      <ThemedText themeColor="textSecondary">
        Zu diesem Link habe ich keinen Text gefunden. Offline, oder weder arXiv noch DOI.
      </ThemedText>
    );
  }

  const abstractHtml = parsed?.abstract || (abstract ? `<p>${escapeHtml(abstract)}</p>` : '');

  return (
    <View style={styles.box}>
      {style}
      {parsed && (
        <Row>
          <Chip label="Kurz" selected={mode === 'short'} onPress={() => setMode('short')} />
          <Chip label="Volltext" selected={mode === 'full'} onPress={() => setMode('full')} />
        </Row>
      )}

      {mode === 'full' && parsed ? (
        <Html html={parsed.full} />
      ) : (
        <>
          <SummarySection paper={paper} text={parsed?.plain || abstract} />
          <ThemedText type="smallBold" style={styles.heading}>
            Abstract
          </ThemedText>
          {abstractHtml ? (
            <Html html={abstractHtml} />
          ) : (
            <ThemedText themeColor="textSecondary">Kein Abstract gefunden.</ThemedText>
          )}

          {parsed && parsed.figures.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.heading}>
                Abbildungen ({parsed.figures.length})
              </ThemedText>
              <Html html={parsed.figures.join('')} />
            </>
          )}

          {parsed?.conclusion ? (
            <>
              <ThemedText type="smallBold" style={styles.heading}>
                Fazit
              </ThemedText>
              <Html html={parsed.conclusion} />
            </>
          ) : null}

          {!parsed && (
            <ThemedText type="small" themeColor="textSecondary">
              Volltext gibt es in der App nur für arXiv-Paper. Das Original öffnet sich über den
              Link oben.
            </ThemedText>
          )}
        </>
      )}
    </View>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  heading: { fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.two },
});
