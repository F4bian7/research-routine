import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { WEEKDAY_SHORT, weekKeys, weekdayOf } from '@/domain/dates';
import { useTheme } from '@/hooks/use-theme';

export function WeekDots({ today, done }: { today: string; done: Set<string> }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {weekKeys(today).map((key) => {
        const filled = done.has(key);
        const isToday = key === today;
        return (
          <View key={key} style={styles.cell}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: filled ? theme.success : 'transparent',
                  borderColor: filled ? theme.success : isToday ? theme.text : theme.border,
                },
              ]}
            />
            <ThemedText
              type={isToday ? 'smallBold' : 'small'}
              themeColor={isToday ? 'text' : 'textSecondary'}>
              {WEEKDAY_SHORT[weekdayOf(key)]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: Spacing.one, flex: 1 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
