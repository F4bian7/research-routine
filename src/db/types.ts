// Domain types shared by the data layer and the UI.

export type Topic = {
  id: number;
  name: string;
  color: string;
  keywords: string; // comma-separated; words inside one keyword must all match
  goal: string; // what the user needs the topic for, e.g. an upcoming thesis
};

export type PersonLinks = {
  scholar?: string;
  semanticScholar?: string;
  bluesky?: string;
  x?: string;
  website?: string;
  github?: string; // user name; new repositories show up in the timeline
  blog?: string; // RSS or Atom feed URL; new posts show up in the timeline
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
  geminiModel: string; // for lessons, course plans and paper summaries
  geminiFastModel: string; // for ratings, explanations and flashcards (larger free quota)
  geminiUsage: { date: string; counts: Record<string, number> }; // requests today per model
  // Bluesky accounts (handles) or one list URL; empty = search posts by topic keywords.
  blueskySource: string;
  openalexKey: string | null; // optional; raises the daily OpenAlex budget tenfold
  focusTopicId: number | null; // when set, daily lessons come from this topic only
  packs: string[]; // ids of study packs already added
  newsAccounts: string; // Bluesky accounts for science news in Highlights
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

export type Note = {
  id: number;
  title: string;
  body: string; // may contain [[Other note title]] links
  quote: string; // highlighted passage from a paper, if any
  paperId: number | null;
  topicIds: number[];
  personIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type CardSource = 'lesson' | 'paper' | 'note' | 'manual';
export type CardStatus = 'suggested' | 'active' | 'suspended';

export type Card = {
  id: number;
  front: string;
  back: string;
  source: CardSource;
  noteId: number | null;
  paperId: number | null;
  lessonId: number | null;
  topicId: number | null;
  status: CardStatus;
  due: string | null; // YYYY-MM-DD; null = new, never reviewed
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
  createdAt: string;
};

export type Quiz = {
  question: string;
  options: string[];
  answer: number; // index into options
  explanation: string;
};

// A place the learner can go from a lesson: a deeper concept or a neighbouring field.
export type Direction = { title: string; why: string };

export type LessonContent = {
  body: string; // paragraphs separated by blank lines; "## " starts a heading, "- " a bullet
  keyPoints: string[];
  quiz: Quiz; // the first check question (older lessons have only this one)
  checks?: Quiz[]; // understanding checks
  deeper?: Direction[]; // suggestions to go deeper
  broader?: Direction[]; // suggestions to go broader
  cards: { front: string; back: string }[];
};

// Core lessons follow the course plan; explorations branch off a lesson on request.
export type LessonKind = 'core' | 'deeper' | 'broader' | 'simpler' | 'question';

export type Lesson = {
  id: number;
  topicId: number | null;
  position: number;
  title: string;
  outline: string;
  content: LessonContent | null;
  status: 'planned' | 'done';
  doneAt: string | null;
  parentId: number | null; // the lesson an exploration branched off
  kind: LessonKind;
  prompt: string; // the question asked, for kind 'question'
};
