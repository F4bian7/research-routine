import type { PaperType } from '@/db/types';

export const PAPER_TYPE_LABEL: Record<PaperType, string> = {
  survey: 'Survey',
  milestone: 'Milestone',
  best_paper: 'Best Paper',
  challenge: 'Challenge report',
  other: 'Other',
};
