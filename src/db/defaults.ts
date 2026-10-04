import type { DayTask, QuickLink, Settings } from './types';

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { id: 'scholarInbox', label: 'Scholar Inbox', url: 'https://www.scholar-inbox.com' },
  { id: 'bluesky', label: 'Bluesky-Liste', url: 'https://bsky.app' },
  { id: 'x', label: 'X-Liste', url: 'https://x.com' },
  { id: 'alphaxiv', label: 'alphaXiv', url: 'https://www.alphaxiv.org' },
  { id: 'hfPapers', label: 'Hugging Face Daily Papers', url: 'https://huggingface.co/papers' },
];

export const DEFAULT_SETTINGS: Settings = {
  reminderTime: null,
  weekendCounts: false,
  quickLinks: DEFAULT_QUICK_LINKS,
};

export const DEFAULT_ROUTINE: DayTask[] = [
  {
    weekday: 1,
    title: 'Neue Paper durchgehen',
    description: 'Scholar Inbox öffnen und 2 bis 3 neue Paper bewerten.',
    durationMin: 5,
    enabled: true,
    kind: 'inbox',
  },
  {
    weekday: 2,
    title: '1 Paper aus dem Backlog',
    description: 'Abstract, Abbildungen und Fazit lesen.',
    durationMin: 10,
    enabled: true,
    kind: 'backlog',
  },
  {
    weekday: 3,
    title: 'Social-Feed überfliegen',
    description: 'Bluesky- und X-Liste kurz durchscrollen.',
    durationMin: 5,
    enabled: true,
    kind: 'social',
  },
  {
    weekday: 4,
    title: '1 Paper aus dem Backlog',
    description: 'Abstract, Abbildungen und Fazit lesen.',
    durationMin: 10,
    enabled: true,
    kind: 'backlog',
  },
  {
    weekday: 5,
    title: 'Neue Paper plus Survey',
    description: 'Neue Paper durchgehen und 1 Survey oder Meilenstein anlesen.',
    durationMin: 10,
    enabled: true,
    kind: 'inbox_backlog',
  },
  {
    weekday: 6,
    title: 'Frei',
    description: 'Optional: Trending auf alphaXiv oder Hugging Face Daily Papers.',
    durationMin: 5,
    enabled: true,
    kind: 'trending',
  },
  {
    weekday: 0,
    title: 'Frei',
    description: 'Optional: Trending auf alphaXiv oder Hugging Face Daily Papers.',
    durationMin: 5,
    enabled: true,
    kind: 'trending',
  },
];
