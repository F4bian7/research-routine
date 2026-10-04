import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { backupFileName, BackupError, exportBackup, importBackup } from '@/data/backup';
import { filesSupported, pickTextFile, saveFile } from '@/data/files';
import { useQuery } from '@/data/use-query';
import { useDb } from '@/db/db';
import { listPeople } from '@/db/repos/people';
import { DEFAULT_SETTINGS } from '@/db/defaults';
import { saveDayTask } from '@/db/repos/routine';
import { setSetting } from '@/db/repos/settings';
import type { DayTask, QuickLink, Settings, TaskKind } from '@/db/types';
import { todayKey, WEEKDAY_LONG, WEEKDAY_SHORT } from '@/domain/dates';
import { blueskyHandle } from '@/domain/person-links';
import { parseTime, reminderIcs } from '@/domain/reminder';
import { useTheme } from '@/hooks/use-theme';
import { explainError, testGemini } from '@/sources/gemini';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

// ---- Routine ---------------------------------------------------------------

const KIND_LABEL: Record<TaskKind, string> = {
  inbox: 'New papers',
  inbox_backlog: 'New papers + survey',
  backlog: 'Backlog paper',
  social: 'People feed',
  trending: 'Trending',
  custom: 'Nothing extra',
};

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function DayEditor({ task }: { task: DayTask }) {
  const db = useDb();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [duration, setDuration] = useState(String(task.durationMin));
  const save = (patch: Partial<DayTask> = {}) =>
    saveDayTask(db, {
      ...task,
      title: title.trim() || task.title,
      description: description.trim(),
      durationMin: Math.max(0, Number(duration) || 0),
      ...patch,
    });

  return (
    <View style={[styles.day, { borderBottomColor: theme.border }]}>
      <View style={styles.toggle}>
        <Pressable onPress={() => setOpen(!open)} style={styles.flex} hitSlop={8}>
          <ThemedText>
            <ThemedText style={styles.bold}>{WEEKDAY_SHORT[task.weekday]}</ThemedText>
            {'  '}
            {task.title} · {task.durationMin} min
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {open ? 'Close' : 'Edit'}
          </ThemedText>
        </Pressable>
        <Switch value={task.enabled} onValueChange={(enabled) => save({ enabled })} />
      </View>
      {open && (
        <View style={styles.dayBody}>
          <Field label={`Task on ${WEEKDAY_LONG[task.weekday]}`} value={title} onChangeText={setTitle} onBlur={() => save()} />
          <Field label="Description" value={description} onChangeText={setDescription} onBlur={() => save()} multiline />
          <Field
            label="Minutes"
            value={duration}
            onChangeText={setDuration}
            onBlur={() => save()}
            keyboardType="number-pad"
          />
          <Hint>What the Today card shows with it:</Hint>
          <Row>
            {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
              <Chip key={k} label={KIND_LABEL[k]} selected={task.kind === k} onPress={() => save({ kind: k })} />
            ))}
          </Row>
        </View>
      )}
    </View>
  );
}

export function RoutineSection({ routine, settings }: { routine: DayTask[]; settings: Settings }) {
  const db = useDb();
  return (
    <Section title="Routine">
      <Hint>One task per weekday, a bonus next to the daily Learn session (the session keeps the streak). Switch a day off to make it a rest day; then a missed session does not break the streak.</Hint>
      {WEEK_ORDER.map((wd) => routine.find((t) => t.weekday === wd))
        .filter((t): t is DayTask => !!t)
        .map((t) => (
          <DayEditor key={t.weekday} task={t} />
        ))}
      <Toggle
        label="Weekend counts for the streak"
        value={settings.weekendCounts}
        onChange={(v) => setSetting(db, 'weekendCounts', v)}
      />
    </Section>
  );
}

// ---- Reminder --------------------------------------------------------------

const APP_URL =
  typeof window !== 'undefined' ? `${window.location.origin}${process.env.EXPO_BASE_URL ?? ''}/` : '';

export function ReminderSection({ settings }: { settings: Settings }) {
  const db = useDb();
  const [time, setTime] = useState(settings.reminderTime ?? '08:00');
  const [status, setStatus] = useState('');
  const [showShortcut, setShowShortcut] = useState(false);

  async function addToCalendar() {
    const t = parseTime(time);
    if (!t) return setStatus('Please enter a time like 08:00.');
    await setSetting(db, 'reminderTime', t);
    setTime(t);
    await saveFile(
      'research-routine-reminder.ics',
      'text/calendar',
      reminderIcs({ time: t, weekdaysOnly: !settings.weekendCounts, startDate: todayKey(), appUrl: APP_URL })
    );
    setStatus('');
  }

  return (
    <Section title="Daily reminder">
      <Hint>
        A web app cannot send its own notifications at a fixed time on the iPhone. Two ways
        that work: a repeating calendar event with an alert, or an automation in the
        Shortcuts app.
      </Hint>
      <Field
        label="Time"
        value={time}
        onChangeText={setTime}
        onBlur={() => {
          const t = parseTime(time);
          if (t) setSetting(db, 'reminderTime', t);
        }}
        placeholder="08:00"
        keyboardType="numbers-and-punctuation"
      />
      {filesSupported && <Button label="Add to Calendar" variant="primary" onPress={addToCalendar} />}
      {status ? <Hint>{status}</Hint> : null}
      <Hint>
        {settings.weekendCounts ? 'Every day' : 'Monday to Friday'}, follows the weekend setting
        above. If iOS offers no Calendar option, open the file from Files.
      </Hint>
      <Pressable onPress={() => setShowShortcut(!showShortcut)} hitSlop={8}>
        <ThemedText type="small" style={styles.link}>
          {showShortcut ? '▾' : '▸'} Use the Shortcuts app instead
        </ThemedText>
      </Pressable>
      {showShortcut && (
        <Hint>
          {'1. Open Shortcuts, tab "Automation", "+", "Time of Day".\n' +
            `2. Set ${parseTime(time) ?? '08:00'}, repeat daily or on weekdays, choose "Run Immediately".\n` +
            '3. Add the action "Show Notification" with a text like "Research routine",\n' +
            '   or the action "Open URLs" with the app link to open it right away.'}
        </Hint>
      )}
    </Section>
  );
}

// ---- Quick links -----------------------------------------------------------

function LinkEditor({ link, onSave, onDelete }: { link: QuickLink; onSave: (l: QuickLink) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const commit = () => onSave({ ...link, label: label.trim() || link.label, url: url.trim() });
  return (
    <View style={styles.dayBody}>
      <Field label="Name" value={label} onChangeText={setLabel} onBlur={commit} />
      <Field label="Link" value={url} onChangeText={setUrl} onBlur={commit} autoCapitalize="none" keyboardType="url" />
      <Row>
        <Button label="Open ↗" variant="ghost" onPress={() => openUrl(url)} />
        <Button label="Remove" variant="ghost" onPress={onDelete} />
      </Row>
    </View>
  );
}

export function QuickLinksSection({ settings }: { settings: Settings }) {
  const db = useDb();
  const links = settings.quickLinks;
  const save = (next: QuickLink[]) => setSetting(db, 'quickLinks', next);
  return (
    <Section title="Quick links">
      <Hint>
        Sites the app cannot show inside, offered on the Today card: Scholar Inbox on new-paper
        days, X on Bluesky days, alphaXiv on trending days. Put your own X list here.
      </Hint>
      {links.map((l) => (
        <LinkEditor
          key={l.id}
          link={l}
          onSave={(n) => save(links.map((x) => (x.id === n.id ? n : x)))}
          onDelete={() => save(links.filter((x) => x.id !== l.id))}
        />
      ))}
      <Button
        label="+ Link"
        onPress={() => save([...links, { id: `link-${Date.now()}`, label: 'New link', url: 'https://' }])}
      />
      <Button label="Restore the default links" variant="ghost" onPress={() => save(DEFAULT_SETTINGS.quickLinks)} />
    </Section>
  );
}

// ---- Gemini and Bluesky ----------------------------------------------------

export function GeminiSection({ settings }: { settings: Settings }) {
  const db = useDb();
  const [key, setKey] = useState(settings.geminiApiKey ?? '');
  const [model, setModel] = useState(settings.geminiModel);
  const [fast, setFast] = useState(settings.geminiFastModel);
  const [status, setStatus] = useState('');
  const usage =
    settings.geminiUsage.date === todayKey()
      ? Object.entries(settings.geminiUsage.counts)
          .map(([m, n]) => `${m}: ${n}`)
          .join(' · ')
      : '';

  async function save() {
    await setSetting(db, 'geminiApiKey', key.trim() || null);
    await setSetting(db, 'geminiModel', model.trim() || DEFAULT_SETTINGS.geminiModel);
    await setSetting(db, 'geminiFastModel', fast.trim() || DEFAULT_SETTINGS.geminiFastModel);
  }

  async function test() {
    await save();
    if (!key.trim()) return setStatus('Enter a key first.');
    setStatus('Asking Gemini …');
    const lines: string[] = [];
    for (const [label, chosen, setter, settingKey] of [
      ['Quality', model.trim() || DEFAULT_SETTINGS.geminiModel, setModel, 'geminiModel'],
      ['Fast', fast.trim() || DEFAULT_SETTINGS.geminiFastModel, setFast, 'geminiFastModel'],
    ] as const) {
      try {
        const used = await testGemini({
          apiKey: key.trim(),
          model: chosen,
          onModel: (m) => {
            setter(m);
            setSetting(db, settingKey, m);
          },
        });
        lines.push(used === chosen ? `${label}: ${used} works.` : `${label}: ${chosen} is not available, now using ${used}.`);
      } catch (e) {
        lines.push(`${label}: ${explainError(e)}`);
      }
    }
    setStatus(lines.join('\n'));
  }

  return (
    <Section title="Gemini (summaries, lessons, ratings)">
      <Hint>
        Free key from Google AI Studio: sign in, {'"Create API key"'}, copy the key and paste it
        here. The key stays on this device and is never part of a backup. On the free tier
        Google may use the text it receives to improve its products; your notes are never
        sent.
      </Hint>
      <Button label="Open Google AI Studio ↗" onPress={() => openUrl('https://aistudio.google.com/apikey')} />
      <Field
        label="API key"
        value={key}
        onChangeText={setKey}
        onBlur={save}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="AIza…"
      />
      <Hint>
        On the free tier every Flash model has 20 requests a day, Flash-Lite 500, Gemma 4
        about 14,400. The quality model writes lessons, course plans and paper summaries; when
        its 20 are used, the other Flash models take over (about 80 a day together), then
        Flash-Lite. The fast model rates and explains feed items and drafts flashcards; after
        Flash-Lite comes Gemma. You do not need to change anything here.
      </Hint>
      <Field label="Quality model" value={model} onChangeText={setModel} onBlur={save} autoCapitalize="none" autoCorrect={false} />
      <Field label="Fast model" value={fast} onChangeText={setFast} onBlur={save} autoCapitalize="none" autoCorrect={false} />
      <Row>
        <Button label="Test key" variant="primary" onPress={test} />
        <Button
          label="Your limits ↗"
          variant="ghost"
          onPress={() => openUrl('https://aistudio.google.com/rate-limit?timeRange=last-28-days')}
        />
      </Row>
      {status ? <ThemedText type="small">{status}</ThemedText> : null}
      <Hint>{usage ? `Requests today: ${usage}` : 'No requests today yet.'}</Hint>
    </Section>
  );
}

export function BlueskySection({ settings }: { settings: Settings }) {
  const db = useDb();
  const [source, setSource] = useState(settings.blueskySource);
  const [news, setNews] = useState(settings.newsAccounts);
  const people = useQuery(listPeople) ?? [];
  const handles = people.map((p) => blueskyHandle(p.links.bluesky)).filter((h): h is string => !!h);
  return (
    <Section title="Bluesky feed">
      <Hint>
        Accounts (for example name.bsky.social, separated by commas) or the link to one Bluesky
        list. Leave empty to see posts that link to arXiv and match your topic keywords.
      </Hint>
      <Field
        label="Accounts or list link"
        value={source}
        onChangeText={setSource}
        onBlur={() => setSetting(db, 'blueskySource', source.trim())}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://bsky.app/profile/…/lists/…"
      />
      <Field
        label="Science news accounts (Feed → Highlights)"
        value={news}
        onChangeText={setNews}
        onBlur={() => setSetting(db, 'newsAccounts', news.trim())}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="nature.com, science.org"
      />
      {handles.length > 0 && (
        <Button
          label={`Use my people's accounts (${handles.length})`}
          onPress={() => {
            const next = handles.join(', ');
            setSource(next);
            setSetting(db, 'blueskySource', next);
          }}
        />
      )}
    </Section>
  );
}

export function OpenAlexSection({ settings }: { settings: Settings }) {
  const db = useDb();
  const [key, setKey] = useState(settings.openalexKey ?? '');
  return (
    <Section title="OpenAlex (paper search)">
      <Hint>
        New papers, people and abstracts come from OpenAlex. Without a key every network gets
        a small free budget per day (about 100 searches), which the feeds can use up. A free
        OpenAlex account gives you a key with ten times more. The key stays on this device.
      </Hint>
      <Button
        label="How to get a free key ↗"
        onPress={() => openUrl('https://help.openalex.org/api/authentication/')}
      />
      <Field
        label="OpenAlex API key (optional)"
        value={key}
        onChangeText={setKey}
        onBlur={() => setSetting(db, 'openalexKey', key.trim() || null)}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Section>
  );
}

// ---- Backup ----------------------------------------------------------------

export function BackupSection({ onImported }: { onImported: () => void }) {
  const db = useDb();
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function doExport() {
    const backup = await exportBackup(db);
    await saveFile(backupFileName(), 'application/json', JSON.stringify(backup, null, 1));
  }

  async function doImport() {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    const text = await pickTextFile('application/json,.json');
    if (text === null) return;
    try {
      await importBackup(db, JSON.parse(text));
      setStatus('Backup restored.');
      onImported();
    } catch (e) {
      setStatus(e instanceof BackupError ? e.message : 'This file could not be read.');
    }
  }

  if (!filesSupported) {
    return (
      <Section title="Backup">
        <Hint>Backups are available in the web app.</Hint>
      </Section>
    );
  }
  return (
    <Section title="Backup">
      <Hint>
        All data as one JSON file: backlog, notes, ratings, summaries, streak, topics and
        settings (without the Gemini key). Removing the app from the home screen deletes its
        data, so keep a copy in Files now and then.
      </Hint>
      <Button label="Export backup" variant="primary" onPress={doExport} />
      <Button
        label={confirm ? 'Replace all data with a backup?' : 'Import backup'}
        variant={confirm ? 'danger' : 'secondary'}
        onPress={doImport}
      />
      {status ? <ThemedText type="small">{status}</ThemedText> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  flex: { flex: 1 },
  bold: { fontWeight: 700 },
  day: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: Spacing.two, gap: Spacing.two },
  dayBody: { gap: Spacing.two },
  link: { textDecorationLine: 'underline' },
});
