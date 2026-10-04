// Domain types shared by the data layer and the UI.

export type Topic = {
  id: number;
  name: string;
  color: string;
};

export type PersonLinks = {
  scholar?: string;
  semanticScholar?: string;
  bluesky?: string;
  x?: string;
  website?: string;
};

export type Person = {
  id: number;
  name: string;
  institution: string;
  topicIds: number[];
  links: PersonLinks;
};

export type PaperType = 'survey' | 'milestone' | 'best_paper' | 'challenge' | 'other';
export type PaperStatus = 'queued' | 'read' | 'skipped';
export type Rating = 'up' | 'down' | null;

export type Paper = {
  id: number;
  title: string;
  authors: string;
  year: number | null;
  url: string;
  topicId: number | null;
  type: PaperType;
  status: PaperStatus;
  rating: Rating;
  note: string;
  addedAt: string;
  readAt: string | null;
  position: number;
};

// What the "Heute" card embeds besides title and description.
export type TaskKind = 'inbox' | 'backlog' | 'social' | 'inbox_backlog' | 'trending' | 'custom';

export type DayTask = {
  weekday: number; // 0 = Sunday ... 6 = Saturday, as Date.getDay()
  title: string;
  description: string;
  durationMin: number;
  enabled: boolean;
  kind: TaskKind;
};

export type Completion = {
  date: string; // YYYY-MM-DD, local time
  taskTitle: string;
};

export type QuickLink = {
  id: string;
  label: string;
  url: string;
};

export type Settings = {
  reminderTime: string | null; // HH:MM, null = off
  weekendCounts: boolean;
  quickLinks: QuickLink[];
};
