import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { DbProvider } from '@/db/db-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DbProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="paper/[id]" />
          <Stack.Screen name="paper/new" />
          <Stack.Screen name="person/[id]" />
          <Stack.Screen name="person/edit" />
        </Stack>
      </DbProvider>
    </ThemeProvider>
  );
}
