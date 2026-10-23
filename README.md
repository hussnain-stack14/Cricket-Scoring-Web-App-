# Crease — Cricket Scoring

A mobile-first cricket scorebook with a public product landing page at `/` and the scoring app at `/app/`, built with Next.js App Router, JavaScript/JSX, Tailwind CSS and Dexie/IndexedDB. Cricket scoring remains local-first in IndexedDB. Optional team registration, login and cross-device synchronization use server-side Next.js APIs, MongoDB Atlas and secure HTTP-only sessions.

The original README is preserved in [Docs/ORIGINAL-README.md](Docs/ORIGINAL-README.md); historical planning documents may describe earlier architecture.

## Run locally

Use Node.js 22.13+ (tested with 24.18) and npm. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

```sh
npm ci
npm run dev
```

Development mode is for editing; offline operation requires the production export:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3000. `npm start` runs the built Next.js server; deploy with the standard Next.js/Vercel integration, not as a static export. The production build generates the PWA icons and service worker from the Next.js build output.

### Team account environment

Cricket scoring and IndexedDB work without these settings. Team registration, login, and sync require:

- `MONGODB_URI`: a MongoDB Atlas connection string for a database user with read/write access to the app database. Encode special characters in the URI username/password. Atlas clusters must support transactions because team registration creates the account and owner member atomically.
- `SESSION_SECRET`: a randomly generated secret of at least 32 characters. Keep it server-only; never use a `NEXT_PUBLIC_` prefix.

For local account testing, put the values in the root `.env.local` file. In Vercel, configure both variables for the **Production** environment (and Preview/Development as needed), then redeploy the deployment yourself. In Atlas, verify the database user's password and database role, DNS resolution for the cluster hostname, and network access from Vercel. Do not paste credentials into source code or logs.

The checked-in Vercel project currently has no Production environment variables, so its registration API cannot connect until these are configured. No deployment is performed by this project build or test procedure.

## First use and core flows

1. Open `/` for the Crease landing page, then choose **Open app** to visit `/app/`.
2. Enter a local display name. Crease creates a random workspace ID, without example data.
3. Create or select two teams, configure rules and toss, and start. Player entry and optional pre-match squads are not required.
4. Select existing players or add batters and bowlers directly from the scoring screen. Player records are assigned to their team and included in match history.
5. Score ordinary balls with one tap (0–4, 6); choose a wicket type after tapping **W**. Wide, no-ball, bye and leg-bye open a compact delivery sheet with clear run choices, automatically calculated penalty totals, and a Record Ball action. Use Advanced delivery for mixed extras, overthrows, and unusual dismissals. Select replacement batters and a different bowler when prompted. View both scorecards and over-by-over history.
6. Finalize a completed result to include it in player statistics. Reopen removes it from career totals until finalized again.

Players with identical names are distinguished by short UUIDs and team membership. New match players may be added during scoring up to the configured number of players per side. Team/player edits and archive operations preserve match history. Permanently deleting an individual record is available only when no match history references it; otherwise archive it to preserve the scorebook. Live means scoring in progress on this device, not broadcasting.

The scoring controls block concurrent commits and assign unique event IDs; the score changes only after the local transaction saves. Undo reverses the most recent delivery through the correction audit. Database transactions check match revisions, so a stale tab receives a visible conflict instead of overwriting newer play. Close extra tabs during backup replacement; refresh a stale scoring tab before continuing.

## Offline preparation and updates

Visit the production site online using a supported browser and wait for **Ready for Offline Use**. More → Offline & installation displays status and offers retry. Ready is shown only after service-worker activation and verification that every resource in the build's precache exists. This includes pre-rendered app routes, Next.js JavaScript/CSS assets and icons. The development server does not generate `/sw.js` or the production icons and reports that offline preparation needs a production build.

The install manifest starts at `/app`. Scoring routes are pre-rendered by Next.js and cached by the service worker. Full-document links and cache-first navigation avoid requiring a server-rendered response for records created offline. Close and reopen the app while disconnected to verify preparation before relying on it at a match. Initial download and updates require internet.

Updates wait until explicitly applied from More. The update button is unavailable while local matches are live. Finish saves/drafts and close other tabs first. Old asset caches are retained to keep open older tabs working; this trades storage space for update safety. No asset-cache operation deletes IndexedDB. Browser settings can remove old asset caches, but avoid clearing site data unless you have exported your records.

**Install Crease** invokes the browser's native installation prompt when the browser offers one; otherwise it displays platform-specific instructions. When installed, the action becomes **Open Crease**. On Android use a compatible browser's Install app/Add to Home screen menu if no prompt appears. On iPhone/iPad, open the site in Safari and use Share → Add to Home Screen. Physical iOS/Android installation and standalone lifecycle checks must be performed separately; automated Chromium tests do not prove those checks.

## Storage and backups

Each browser profile/device has its own local workspace. Optional team accounts synchronize players, teams, matches, innings, scoring events and related records through the authenticated sync APIs. Previously synchronized team records remain available offline in their account-scoped IndexedDB workspace; temporary network failures do not switch the active workspace to guest data. A deliberate sign-out first synchronizes and verifies the queue, then asks for confirmation before removing only that team's local workspace. It revokes the current server-side session and broadcasts local cleanup to the other tabs in this browser. If synchronization is incomplete, sign-out is blocked and the local backup can be exported. Anyone sharing an unlocked browser profile may access its locally cached records. Browser clearing, eviction or device loss can remove data. More offers a persistent-storage request where supported.

Export downloads a version-2 JSON backup with workspace settings, players, teams, memberships, matches, innings, events, audits and setup draft. Verify the downloaded file and keep a copy outside this browser. The last-export timestamp records a download request, not ongoing backup protection.

Import accepts up to 20 MB, validates versions, IDs, types, relationships and replayable match history, then previews counts. Export the current workspace before confirming replacement. Import replaces records transactionally rather than merging; invalid input or a failed transaction leaves the previous records intact. Imported records are scoped to the current workspace ID. Statistics are derived, so restoration does not duplicate accumulated totals.

## Architecture

- `app/`: App Router landing page, `/app/` scoring routes, legacy scorebook routes, authentication and sync APIs, and shared responsive styling. System fonts; bundled Lucide icons.
- `components/`: landing page, onboarding/navigation, people management, match setup, live scoring, profiles, storage/settings and offline readiness.
- `lib/engine.js`: pure deterministic event replay, validation, result calculation and raw-total career aggregation. Independent of React and Dexie.
- `lib/db.js`: versioned Dexie schema, scoped repositories, transactional writes, revision conflicts, backup validation and restoration. Version 2 adds drafts without clearing version 1 records.
- `lib/server/`: MongoDB models/connection handling and HTTP-only session configuration; server-only secrets are not bundled to the browser.
- `scripts/precache.mjs`, `scripts/sw-template.js`: build-generated versioned precache and service worker using Next.js routes and static assets.
- `scripts/serve.mjs`: starts the local Next.js production server for browser acceptance tests.
- `tests/`: scoring/database unit tests and production Playwright acceptance tests.
- `Docs/RULES.md`: supported cricket rules, authoritative sources and unsupported variations.

Tables: workspaces/settings, players, teams, memberships, matches (team identities, evolving match rosters and frozen rules), innings (opening selections), events (deliveries and player selections), audits, drafts. Domain records carry a workspace ID. Career statistics combine raw totals from finalized match event replays; there are no incrementally maintained counters to duplicate.

## Corrections and rule limits

Undo previews the delivery being reversed and removes dependent selections. A historical correction explicitly rewinds the selected delivery and all later play, including any later innings. Removed events and innings are retained in the audit. Re-enter the corrected delivery and review/re-enter subsequent play; there is no automatic guess at invalid downstream selections.

This release supports the documented recreational six-ball limited-overs subset, not every MCC/ICC incident. See [the rule contract](Docs/RULES.md). No retired batters, DLS, super over, special penalty runs, runners, overthrow boundary allowances or mid-over injured-bowler substitution. Wicket decisions and run-out ends come from the umpire/scorer. Ties stand.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Windows process restrictions block Node test-worker spawning, run `node --test --test-isolation=none tests/*.test.js`. Production build and browser workers require permission to start subprocesses. If browsers were installed under a custom location, set `PLAYWRIGHT_BROWSERS_PATH` to that location for both installation and test execution.

See [Docs/VALIDATION.md](Docs/VALIDATION.md) for actual test results and outstanding physical-device checks. Tests use disposable browser contexts and generated test records; production is never seeded.

## Author

Hussnain Ali. Built as a portfolio project through a self-directed internship simulation.
