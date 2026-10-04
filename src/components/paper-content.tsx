import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SummarySection } from '@/components/summary-section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Paper } from '@/db/types';
import { parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';

// Native: abstract only. The web build renders the full text (paper-content.web.tsx).
export function PaperContent({ paper }: { paper: Paper }) {
  const [abstract, setAbstract] = useState<string | null>(null);

  useEffect(() => {
    fetchMeta(parsePaperLink(paper.url))
      .then((m) => setAbstract(m?.abstract || ''))
      .catch(() => setAbstract(''));
  }, [paper.url]);

  return (
    <View style={styles.box}>
      {abstract ? <SummarySection paper={paper} text={abstract} abstract={abstract} /> : null}
      <ThemedText type="smallBold">Abstract</ThemedText>
      <ThemedText>{abstract === null ? 'Loading …' : abstract || 'No abstract found.'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
});
