import Tabs from 'expo-router/js-tabs';
import { type ColorValue, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// Material icon paths (Apache 2.0). Plain <svg> works because this file only runs on web.
const ICONS = {
  today:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  backlog:
    'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z',
  people:
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  settings:
    'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
};

function icon(path: string) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d={path} fill={String(color)} />
      </svg>
    );
  }
  return TabIcon;
}

const TodayIcon = icon(ICONS.today);
const BacklogIcon = icon(ICONS.backlog);
const PeopleIcon = icon(ICONS.people);
const SettingsIcon = icon(ICONS.settings);

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Heute', tabBarIcon: TodayIcon }} />
      <Tabs.Screen
        name="backlog"
        options={{ title: 'Backlog', tabBarIcon: BacklogIcon }}
      />
      <Tabs.Screen name="people" options={{ title: 'Themen', tabBarIcon: PeopleIcon }} />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Einstellungen', tabBarIcon: SettingsIcon }}
      />
    </Tabs>
  );
}
