import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Lesson, LessonKind, Quiz, Topic } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import type { ExploreKind } from '@/sources/learning';

const KIND_LABEL: Record<LessonKind, string> = {
  core: 'Lesson',
  deeper: 'Deeper',
  broader: 'Broader',
  simpler: 'More simply',
  question: 'Your question',
};

// **bold** inside a line.
function Inline({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <ThemedText style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <ThemedText key={i} style={[style, styles.bold]}>
            {p.slice(2, -2)}
          </ThemedText>
        ) : (
          p
        )
      )}
    </ThemedText>
  );
}

// The lesson text: "## " headings, "- " bullets, paragraphs.
function RichText({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).flatMap((b) => {
    const lines = b.split('\n');
    // A heading line glued to its paragraph becomes its own block.
    return lines[0].startsWith('## ') && lines.length > 1 ? [lines[0], lines.slice(1).join('\n')] : [b];
  });
  return (
    <View style={styles.rich}>
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith('## ')) {
          return (
            <ThemedText key={i} style={styles.heading}>
              {t.slice(3)}
            </ThemedText>
          );
        }
        if (t.split('\n').every((l) => /^[-•*] /.test(l.trim()))) {
          return (
            <View key={i} style={styles.list}>
              {t.split('\n').map((l, j) => (
                <Inline key={j} text={`•  ${l.trim().slice(2)}`} style={styles.paragraph} />
              ))}
            </View>
          );
        }
        return <Inline key={i} text={t.replace(/\n/g, ' ')} style={styles.paragraph} />;
      })}
    </View>
  );
}

export function LessonBody({ lesson, topic }: { lesson: Lesson; topic?: Topic | null }) {
  const content = lesson.content;
  return (
    <View style={styles.box}>
      <View style={styles.topic}>
        {topic ? <View style={[styles.dot, { backgroundColor: topic.color }]} /> : null}
        <ThemedText type="small" themeColor="textSecondary">
          {[KIND_LABEL[lesson.kind], topic?.name, lesson.kind === 'core' ? `lesson ${lesson.position}` : '']
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      <ThemedText style={styles.title}>{lesson.title}</ThemedText>
      {content ? <RichText body={content.body} /> : null}
      {content && content.keyPoints.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.points}>
          <ThemedText type="smallBold">Key points</ThemedText>
          {content.keyPoints.map((k, i) => (
            <Inline key={i} text={`•  ${k}`} />
          ))}
        </ThemedView>
      )}
    </View>
  );
}

// One multiple-choice question; `onAnswer` fires once with whether it was right.
export function QuizView({ quiz, onAnswer }: { quiz: Quiz; onAnswer: (right: boolean) => void }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <View style={styles.box}>
      <ThemedText style={styles.question}>{quiz.question}</ThemedText>
      {quiz.options.map((o, i) => {
        const answered = picked !== null;
        const right = i === quiz.answer;
        const color = !answered ? theme.border : right ? theme.success : i === picked ? '#D93F3F' : theme.border;
        return (
          <Pressable
            key={i}
            disabled={answered}
            onPress={() => {
              setPicked(i);
              onAnswer(i === quiz.answer);
            }}
            style={({ pressed }) => [styles.option, { borderColor: color, opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText>{o}</ThemedText>
          </Pressable>
        );
      })}
      {picked !== null && (
        <ThemedText style={{ color: picked === quiz.answer ? theme.success : '#D93F3F', fontWeight: 700 }}>
          {picked === quiz.answer ? 'Right!' : 'Not quite.'}{' '}
          <ThemedText themeColor="text" style={styles.normal}>
            {quiz.explanation}
          </ThemedText>
        </ThemedText>
      )}
    </View>
  );
}

// "Check my understanding": the block's questions, one after the other.
export function Checks({ lesson, onAnswer }: { lesson: Lesson; onAnswer: (right: boolean) => void }) {
  const checks = lesson.content?.checks ?? (lesson.content ? [lesson.content.quiz] : []);
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(0);
  if (checks.length === 0) return null;
  if (!open) return <Button label="Check my understanding" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.box}>
      {checks.slice(0, answered + 1).map((q, i) => (
        <QuizView
          key={i}
          quiz={q}
          onAnswer={(right) => {
            onAnswer(right);
            setAnswered((a) => Math.max(a, i + 1));
          }}
        />
      ))}
    </View>
  );
}

// Where to go from here: deeper into a concept, broader to a neighbour, more simply, or
// the learner's own question.
export function NextSteps({
  lesson,
  busy,
  onExplore,
}: {
  lesson: Lesson;
  busy: boolean;
  onExplore: (kind: ExploreKind, target: string) => void;
}) {
  const theme = useTheme();
  const [question, setQuestion] = useState('');
  const c = lesson.content;
  const option = (kind: ExploreKind, title: string, why: string, key: string) => (
    <Pressable
      key={key}
      disabled={busy}
      onPress={() => onExplore(kind, title)}
      style={({ pressed }) => [styles.step, { borderColor: theme.border, opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {kind === 'deeper' ? '↓ Go deeper' : kind === 'broader' ? '↔ Go broader' : '↺ Again, more simply'}
      </ThemedText>
      <ThemedText type="smallBold">{title}</ThemedText>
      {why ? (
        <ThemedText type="small" themeColor="textSecondary">
          {why}
        </ThemedText>
      ) : null}
    </Pressable>
  );
  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Where to next?</ThemedText>
      {(c?.deeper ?? []).map((d, i) => option('deeper', d.title, d.why, `d${i}`))}
      {(c?.broader ?? []).map((d, i) => option('broader', d.title, d.why, `b${i}`))}
      {lesson.kind !== 'simpler' && option('simpler', 'Explain this more simply', '', 'simpler')}
      <Field
        label="Or ask your own question"
        value={question}
        onChangeText={setQuestion}
        multiline
        placeholder="e.g. Why does undersampling cause aliasing?"
      />
      {question.trim() ? (
        <Button
          label="Ask"
          variant="primary"
          disabled={busy}
          onPress={() => {
            onExplore('question', question.trim());
            setQuestion('');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.three },
  topic: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  rich: { gap: Spacing.three },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: 700, marginTop: Spacing.one },
  paragraph: { fontSize: 17, lineHeight: 26 },
  list: { gap: Spacing.one },
  bold: { fontWeight: 700 },
  points: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  question: { fontSize: 19, lineHeight: 26, fontWeight: 700 },
  option: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, minHeight: 52, justifyContent: 'center' },
  normal: { fontWeight: 500 },
  step: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: 2 },
});
