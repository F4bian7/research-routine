// Domain types shared by the data layer and the UI.

export type Topic = {
  id: number;
  name: string;
  color: string;
  keywords: string; // comma-separated; words inside one keyword must all match
};

export type PersonLinks = {
  scholar?: string;
  semanticScholar?: string;
  bluesky?: string;
  x?: string;
  website?: string;
};

// One OpenAlex author profile. OpenAlex often splits a researcher into several
// profiles (other institution, spelling), so a person can have many.
export type AuthorProfile = {
  id: string; // e.g. "A5072647800"
  name: string;
  institutions: string[];
  works: number;
  citations: number;
  topic: string;
  orcid: string | null;
};

export type Person = {
  id: number;
  name: string;
  institution: string;
  topicIds: number[];
  links: PersonLinks;
  openalexIds: string[]; // every profile that belongs to this person
  orcid: string | null; // stays with the person across institutions
  blueskyDid: string | null; // stays when the Bluesky handle changes
  ignoredIds: string[]; // profiles the user said are someone else
  pendingProfiles: AuthorProfile[]; // found later, waiting for "same person?"
  checkedAt: string | null; // last search for new profiles
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

// What the "Today" card embeds besides title and description.
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
  // Gemini API key for summaries. Stays on the device; never part of a JSON export.
  geminiApiKey: string | null;
  geminiModel: string;
  // Bluesky accounts (handles) or one list URL; empty = search posts by topic keywords.
  blueskySource: string;
};

export type Summary = {
  short: string;
  problem: string;
  method: string;
  result: string;
  relevance: string;
  limits: string;
  terms: { term: string; explanation: string }[];
};
