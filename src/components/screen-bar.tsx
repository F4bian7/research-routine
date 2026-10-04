import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Back where we came from; a screen opened directly (no history) goes to `fallback`.
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

type Action = { label: string; onPress: () => void; bold?: boolean; disabled?: boolean };

export function ScreenBar({ left, title, right }: { left?: Action; title?: string; right?: Action }) {
  const theme = useTheme();
  const button = (a?: Action) =>
    a ? (
      <Pressable onPress={a.onPress} disabled={a.disabled} hitSlop={12} style={styles.button}>
        <ThemedText style={{ color: theme.accent, fontWeight: a.bold ? 700 : 500, opacity: a.disabled ? 0.4 : 1 }}>
          {a.label}
        </ThemedText>
      </Pressable>
    ) : (
      <View style={styles.button} />
    );
  return (
    <View style={[styles.bar, { borderBottomColor: theme.border }]}>
      {button(left)}
      {title ? <ThemedText type="smallBold">{title}</ThemedText> : null}
      {button(right)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  button: { minHeight: 44, minWidth: 60, justifyContent: 'center' },
});
