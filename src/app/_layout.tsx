import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ServiceKeys } from '@/components/service-keys';
import { DbProvider } from '@/db/db-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DbProvider>
        <ServiceKeys />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="paper/[id]" />
          <Stack.Screen name="paper/new" />
          <Stack.Screen name="person/[id]" />
          <Stack.Screen name="person/edit" />
          <Stack.Screen name="person/follow" />
          <Stack.Screen name="note/[id]" />
          <Stack.Screen name="note/edit" />
          <Stack.Screen name="card/edit" />
          <Stack.Screen name="lesson/[id]" />
          <Stack.Screen name="learn" />
          <Stack.Screen name="review" />
        </Stack>
      </DbProvider>
    </ThemeProvider>
  );
}
