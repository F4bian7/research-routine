import { type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { mathAsText } from '@/domain/math';

// Native fallback: formulas as plain text. The web build renders them (math-text.web.tsx).
export function MathText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  return <ThemedText style={style}>{mathAsText(text).replace(/\*\*([^*]+)\*\*/g, '$1')}</ThemedText>;
}
