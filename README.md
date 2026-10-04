# Research Routine

Personal paper app: a daily 5 to 10 minute routine with a streak, a one-item-at-a-time
backlog, and the people and topics I follow. Expo (SDK 57), TypeScript, Expo Router.
No backend, no login; all data stays on the phone.

It ships as an installable web app (PWA) on GitHub Pages:
**https://f4bian7.github.io/research-routine/**

## Status

| Step | State |
|---|---|
| Setup (Expo, TypeScript, navigation, database, seed data) | done |
| Web app on GitHub Pages, offline, home screen install | done |
| Tab "Heute" | done |
| Tab "Backlog" (queue, archive, add with clipboard and auto-fill) | done |
| In-app reader (abstract, figures, conclusion, full text for arXiv) | done |
| Feed tab: new papers (arXiv and PubMed via OpenAlex), Hugging Face trending, Bluesky | done |
| Plain-language summaries (Gemini free tier, own key in settings) | done |
| "Ask Claude": hands the paper to a claude.ai chat for follow-up questions | done |
| English UI | done |
| Topics tab: names, colours, feed keywords | done |
| People: links, newest papers (OpenAlex) and Bluesky posts per person | done |
| Follow in two taps, suggestions from the backlog, people timeline in the feed | done |
| Brain tab: notes (second brain) with [[links]], highlights from the reader, Obsidian export | done |
| Learn: daily session with a lesson from a per-topic course and spaced-repetition cards; the streak follows it | done |
| Topic goals, focus topic, study packs (`public/packs/`), OpenAlex key and daily cache | done |
| Feed → Highlights: most cited new papers in all of science, science news, Hacker News, AI trending | done |
| Voices: people without papers via blog feeds, GitHub, Bluesky and Hacker News mentions | done |
| Settings: routine, weekend rule, reminder (calendar or Shortcuts), quick links, JSON backup | done |

## Install on the iPhone

1. Open the URL above in **Safari** (not Chrome; only Safari can add web apps).
2. Share button, then "Zum Home-Bildschirm".
3. Start the app from the new icon. It runs full screen and offline.

Data lives in the browser storage of the home screen app (SQLite via sql.js, saved to
IndexedDB). Home screen apps are exempt from Safari's automatic data deletion, but
removing the icon deletes the data. Export a JSON backup in Settings now and then.

Updates: every push to `main` deploys automatically. The app picks up the new version on
the next start while online.

## Differences from a native build

- No share target: copy a link and use "Aus Zwischenablage einfügen" in the backlog.
- No scheduled local notifications: Settings creates a repeating calendar event with an
  alert, or use an automation in the Shortcuts app (steps are in Settings).

The native build (Expo Go or a development build) still works from the same code; only
the database backend differs (`src/db/db-provider.tsx` vs `db-provider.web.tsx`).

## Development

```bash
npx expo start --web    # dev server in the browser
npm test                # streak logic unit tests
npx tsc --noEmit        # typecheck
npx expo lint
npm run build:web       # production web build into dist/
```

## Layout

- `src/app/` screens (one file per tab)
- `src/components/` UI pieces (`app-tabs.web.tsx` is the web tab bar)
- `src/db/` schema and migrations, seed data, one repo per entity (no React), `Db` interface
  with a native (expo-sqlite) and a web (sql.js + IndexedDB) backend
- `src/domain/` pure logic: local-time date keys, streak rule, spaced repetition (SM-2),
  [[wiki links]], a small ZIP writer
- `src/sources/` paper lookup: link parsing, OpenAlex metadata, arXiv HTML full text
  (cached with the Cache API, not in SQLite)
- `src/data/` `useQuery` hook and change notification between repos and screens
- `public/` sql.js runtime, web manifest, icons
- `scripts/build-web.mjs` export plus PWA patching and service worker

The streak is computed from the `completions` table on every render, never stored.
