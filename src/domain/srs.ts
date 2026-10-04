import { addDays } from './dates';

// Spaced repetition, a simplified SM-2 (the scheme behind Anki): each good answer
// stretches the gap to the next review by the card's "ease"; a miss starts over.
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export type SrsState = {
  due: string | null; // null = never reviewed
  intervalDays: number;
  ease: number;
  reps: number; // correct answers in a row
  lapses: number;
};

export const NEW_CARD: SrsState = { due: null, intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;

export function nextInterval(s: SrsState, grade: Grade): number {
  const prev = Math.max(1, s.intervalDays);
  let days: number;
  if (grade === 'again') days = 1;
  else if (grade === 'hard') days = s.reps === 0 ? 1 : Math.max(prev + 1, Math.round(prev * 1.2));
  else if (grade === 'good') days = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(prev * s.ease);
  else days = s.reps === 0 ? 3 : Math.round(prev * s.ease * 1.3);
  return Math.min(MAX_INTERVAL, Math.max(1, days));
}

export function review(s: SrsState, grade: Grade, today: string): SrsState {
  const intervalDays = nextInterval(s, grade);
  const easeDelta = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[grade];
  return {
    due: addDays(today, intervalDays),
    intervalDays,
    ease: Math.max(MIN_EASE, Math.round((s.ease + easeDelta) * 100) / 100),
    reps: grade === 'again' ? 0 : s.reps + 1,
    lapses: grade === 'again' ? s.lapses + 1 : s.lapses,
  };
}

export function intervalLabel(days: number) {
  if (days < 30) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return '1 y';
}
