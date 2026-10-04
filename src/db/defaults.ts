import type { DayTask, QuickLink, Settings } from './types';

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { id: 'scholarInbox', label: 'Scholar Inbox', url: 'https://www.scholar-inbox.com' },
  { id: 'x', label: 'X list', url: 'https://x.com' },
  { id: 'alphaxiv', label: 'alphaXiv', url: 'https://www.alphaxiv.org' },
];

export const DEFAULT_SETTINGS: Settings = {
  reminderTime: null,
  weekendCounts: false,
  quickLinks: DEFAULT_QUICK_LINKS,
  geminiApiKey: null,
  // Alias that follows the newest Flash release, so the app does not pin a retired model.
  geminiModel: 'gemini-flash-latest',
  blueskySource: '',
};

export const DEFAULT_ROUTINE: DayTask[] = [
  {
    weekday: 1,
    title: 'Go through new papers',
    description: 'Open Scholar Inbox and rate 2 to 3 new papers.',
    durationMin: 5,
    enabled: true,
    kind: 'inbox',
  },
  {
    weekday: 2,
    title: 'One paper from the backlog',
    description: 'Read the abstract, figures and conclusion.',
    durationMin: 10,
    enabled: true,
    kind: 'backlog',
  },
  {
    weekday: 3,
    title: 'Skim the social feed',
    description: 'Scroll through the Bluesky and X lists.',
    durationMin: 5,
    enabled: true,
    kind: 'social',
  },
  {
    weekday: 4,
    title: 'One paper from the backlog',
    description: 'Read the abstract, figures and conclusion.',
    durationMin: 10,
    enabled: true,
    kind: 'backlog',
  },
  {
    weekday: 5,
    title: 'New papers plus a survey',
    description: 'Go through new papers and start one survey or milestone paper.',
    durationMin: 10,
    enabled: true,
    kind: 'inbox_backlog',
  },
  {
    weekday: 6,
    title: 'Free day',
    description: 'Optional: trending papers on alphaXiv or Hugging Face Daily Papers.',
    durationMin: 5,
    enabled: true,
    kind: 'trending',
  },
  {
    weekday: 0,
    title: 'Free day',
    description: 'Optional: trending papers on alphaXiv or Hugging Face Daily Papers.',
    durationMin: 5,
    enabled: true,
    kind: 'trending',
  },
];
