import { Linking, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Opens the URL outside the app (Safari, or the Bluesky/X app via universal links).
export function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

export function LinkButton({ label, url }: { label: string; url: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => openUrl(url)}
      style={({ pressed }) => [
        styles.button,
        { borderColor: theme.accent, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText style={{ color: theme.accent }}>{label} ↗</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
