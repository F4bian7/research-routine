import type { PaperType } from '@/db/types';

export const PAPER_TYPE_LABEL: Record<PaperType, string> = {
  survey: 'Survey',
  milestone: 'Meilenstein',
  best_paper: 'Best Paper',
  challenge: 'Challenge-Report',
  other: 'Sonstiges',
};
