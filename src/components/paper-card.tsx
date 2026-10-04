import { StyleSheet, View } from 'react-native';

import { LinkButton } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Paper, Topic } from '@/db/types';
import { PAPER_TYPE_LABEL } from '@/domain/labels';
import { useTheme } from '@/hooks/use-theme';

export function PaperCard({ paper, topic }: { paper: Paper; topic?: Topic }) {
  const theme = useTheme();
  const meta = [paper.authors, paper.year, PAPER_TYPE_LABEL[paper.type]].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      {topic && (
        <View style={styles.topicRow}>
          <View style={[styles.swatch, { backgroundColor: topic.color }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {topic.name}
          </ThemedText>
        </View>
      )}
      <ThemedText type="smallBold" style={styles.title}>
        {paper.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {meta}
      </ThemedText>
      {paper.url ? <LinkButton label="Öffnen" url={paper.url} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 16, lineHeight: 22 },
});
