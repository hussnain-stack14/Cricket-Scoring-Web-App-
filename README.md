# Crease — Cricket Scoring

A mobile-first, device-local cricket scorebook built with Next.js App Router, JavaScript/JSX, Tailwind CSS and Dexie/IndexedDB. There is no runtime API, database server, authentication service, external font or cloud synchronization dependency.

**The local-first requirement supersedes the earlier backend-dependent MERN architecture.** The original README is preserved in [Docs/ORIGINAL-README.md](Docs/ORIGINAL-README.md); the original requirements and Day 1 notes remain intact as historical planning documents, not current implementation claims.

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

Open http://127.0.0.1:3000. The build creates `out/`, generates 192px/512px normal and maskable PNG icons, then hashes and precaches the complete static export. Deployable output is a plain static directory; no deployment or Git push is performed. Hosting must use HTTPS (localhost is allowed for testing), serve directory `index.html` files, and avoid long-lived caching of `sw.js` and HTML. Serve from the origin root; subdirectory deployment is not configured.

## First use and core flows

1. Enter a local display name. Crease creates a random workspace ID, without example data.
2. Add players, create teams and assign squad members, captain and wicketkeeper.
3. Set up a match through teams/squads, rules, toss, and opening players. Save draft preserves unfinished setup; Continue commits each completed step.
4. Record runs, extras and supported wickets. Select replacement batters and a different bowler when prompted. View both scorecards and over-by-over history.
5. Finalize a completed result to include it in player statistics. Reopen removes it from career totals until finalized again.

Players with identical names are distinguished by short UUIDs and team membership. Team/player edits and archive operations preserve frozen match squads. Hard deletion of individual records is intentionally not exposed; use Archive. Live means scoring in progress on this device, not broadcasting.

The scoring controls debounce rapid taps, disable concurrent commits, and assign unique event IDs. Database transactions check match revisions, so a stale tab receives a visible conflict instead of overwriting newer play. Close extra tabs during backup replacement; refresh a stale scoring tab before continuing.

## Offline preparation and updates

Visit online using a supported browser and wait for **Ready offline**. More → Offline & installation displays status and offers retry. Ready is shown only after service-worker activation and verification that every resource in the build's precache exists. This includes unvisited screens, HTML, Next.js route payloads, JavaScript chunks, CSS and icons.

All record routes are prebuilt (`/match/?id=...`, `/player/?id=...`). Full-document links and cache-first navigation avoid requiring a server-rendered response for records created offline. Close and reopen the app while disconnected to verify preparation before relying on it at a match. Initial download and updates require internet. Development mode does not provide this guarantee.

Updates wait until explicitly applied from More. The update button is unavailable while local matches are live. Finish saves/drafts and close other tabs first. Old asset caches are retained to keep open older tabs working; this trades storage space for update safety. No asset-cache operation deletes IndexedDB. Browser settings can remove old asset caches, but avoid clearing site data unless you have exported your records.

Android/Chromium exposes an install button when the browser provides an install prompt, or use its menu. On iOS Safari use Share → Add to Home Screen. Physical iOS/Android installation and standalone lifecycle checks must be performed separately; automated Chromium tests are not evidence of those checks.

## Storage and backups

Each browser profile/device has its own workspace; there is no account login or sync. Anyone sharing that browser profile can access its records. Browser clearing, eviction or device loss can remove data. More offers a persistent-storage request where supported.

Export downloads a version-2 JSON backup with workspace settings, players, teams, memberships, matches, innings, events, audits and setup draft. Verify the downloaded file and keep a copy outside this browser. The last-export timestamp records a download request, not ongoing backup protection.

Import accepts up to 20 MB, validates versions, IDs, types, relationships and replayable match history, then previews counts. Export the current workspace before confirming replacement. Import replaces records transactionally rather than merging; invalid input or a failed transaction leaves the previous records intact. Imported records are scoped to the current workspace ID. Statistics are derived, so restoration does not duplicate accumulated totals.

## Architecture

- `app/`: static App Router pages and shared responsive styling. System fonts; bundled Lucide icons.
- `components/`: onboarding/navigation, people management, match setup, live scoring, profiles, storage/settings and offline readiness.
- `lib/engine.js`: pure deterministic event replay, validation, result calculation and raw-total career aggregation. Independent of React and Dexie.
- `lib/db.js`: versioned Dexie schema, scoped repositories, transactional writes, revision conflicts, backup validation and restoration. Version 2 adds drafts without clearing version 1 records.
- `scripts/precache.mjs`, `scripts/sw-template.js`: build-generated versioned full-export precache and service worker. No runtime third-party requests.
- `scripts/serve.mjs`: local production static-file preview, not an application backend.
- `tests/`: scoring/database unit tests and production Playwright acceptance tests.
- `Docs/RULES.md`: supported cricket rules, authoritative sources and unsupported variations.

Tables: workspaces/settings, players, teams, memberships, matches (frozen squads and rules), innings (opening selections), events (deliveries and player selections), audits, drafts. Domain records carry a workspace ID. Career statistics combine raw totals from finalized match event replays; there are no incrementally maintained counters to duplicate.

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
