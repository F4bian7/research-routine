import { router } from 'expo-router';

import { Button, Chip } from '@/components/ui';
import { type BrainSource, setPendingSource, type SourceLoader } from '@/data/brain';

// "To my brain": opens the note suggestions for what is being read.
export function openBrain(source: BrainSource | SourceLoader) {
  setPendingSource(source);
  router.push('/note/suggest');
}

export function BrainChip({ source }: { source: () => BrainSource | SourceLoader }) {
  return <Chip label="🧠 Notes" selected={false} onPress={() => openBrain(source())} />;
}

export function BrainButton({ source, label = '🧠 Add to my brain' }: { source: () => BrainSource | SourceLoader; label?: string }) {
  return <Button label={label} onPress={() => openBrain(source())} />;
}
