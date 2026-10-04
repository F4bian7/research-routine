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
| In-app feeds: new papers (PubMed, arXiv via OpenAlex), Bluesky, HF trending | next |
| Plain-language summaries (Claude API, own key) | open |
| Tab "Themen und Personen" | open |
| Tab "Einstellungen" (routine, reminder, quick links, JSON export/import) | open |

## Install on the iPhone

1. Open the URL above in **Safari** (not Chrome; only Safari can add web apps).
2. Share button, then "Zum Home-Bildschirm".
3. Start the app from the new icon. It runs full screen and offline.

Data lives in the browser storage of the home screen app (SQLite via sql.js, saved to
IndexedDB). Home screen apps are exempt from Safari's automatic data deletion, but
removing the icon deletes the data. Use the JSON export as a backup once it exists.

Updates: every push to `main` deploys automatically. The app picks up the new version on
the next start while online.

## Differences from a native build

- No share target: copy a link and use "Aus Zwischenablage einfügen" in the backlog.
- No scheduled local notifications: use an automation in the Shortcuts app instead
  (time of day, daily, "Run immediately", action "Open app" or "Show notification").

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
- `src/domain/` pure logic: local-time date keys, streak rule
- `src/sources/` paper lookup: link parsing, OpenAlex metadata, arXiv HTML full text
  (cached with the Cache API, not in SQLite)
- `src/data/` `useQuery` hook and change notification between repos and screens
- `public/` sql.js runtime, web manifest, icons
- `scripts/build-web.mjs` export plus PWA patching and service worker

The streak is computed from the `completions` table on every render, never stored.
