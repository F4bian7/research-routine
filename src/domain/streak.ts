import { addDays, weekdayOf } from './dates';

// Whether a missed day breaks the streak: workdays always (if their task is
// enabled), weekend days only when the user lets the weekend count.
export function makeCountsRule(enabledByWeekday: Record<number, boolean>, weekendCounts: boolean) {
  return (key: string) => {
    const wd = weekdayOf(key);
    const isWeekend = wd === 0 || wd === 6;
    if (isWeekend && !weekendCounts) return false;
    return enabledByWeekday[wd] ?? false;
  };
}

// Walks backwards from today. Today not done yet does not break the streak.
// A completed day adds 1 whether or not it counts; a missed counting day ends
// the streak; a missed non-counting day is skipped.
export function computeStreak(
  done: Set<string>,
  counts: (key: string) => boolean,
  today: string
): number {
  if (done.size === 0) return 0;
  const earliest = [...done].sort()[0];
  let streak = 0;
  let day = done.has(today) ? today : addDays(today, -1);
  while (day >= earliest) {
    if (done.has(day)) streak += 1;
    else if (counts(day)) break;
    day = addDays(day, -1);
  }
  return streak;
}
