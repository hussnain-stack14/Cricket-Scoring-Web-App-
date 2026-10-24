# Crease upgrade report — 24 October 2026

Implemented in the existing Next.js/React/Dexie/Mongoose application. No dependencies were added, no repository push or deployment was performed, and the unrelated pre-existing `Crease/` and `{` entries were left untouched.

## Root causes and changes

| Area | Finding | Change |
| --- | --- | --- |
| Authentication | Limits lived in per-process memory; no consecutive-password lock existed. | MongoDB-backed account failures, seven-failure threshold, ten-minute lock, atomic revision checks, success reset, generic errors, HTTP 429 and Retry-After, UI countdown. IP/recovery/reset/security limits also persist in MongoDB. |
| Upcoming matches | Creation always assigned `live`; no scheduling input existed. | Optional UTC `scheduledAt`, local datetime input/display, future-only chronological filtering, scheduled detail view, start/reschedule/cancel actions. Legacy matches are not silently reclassified. |
| Drafts | Setup always selected the first draft, discarded typed team names, and starting a match deleted every draft. Backup validation allowed only one draft. | Individual draft IDs and resume URLs, retained fields, repeat saves update the same ID, explicit new setup, deletion, selected-draft consumption only, multi-draft backup support. Existing account synchronization supports drafts. |
| Navigation | Internal anchors reloaded documents; Dashboard was called Home; a stray Home tuple appeared as a statistic. | Next.js Links, consistent Dashboard entry and logo destination `/app/`, active state, removal of the stray statistic. Public landing routes remain. |
| Match deletion | No match deletion lifecycle or UI existed. | Named confirmation dialog; owner checks locally and server-side; local snapshots and cloud soft-deletion tombstones; statistics exclude removed matches. Parent tombstones hide dependent innings/events atomically at the logical match level. Children are retained for audit rather than independently deleted, preventing partial deletion if the parent revision conflicts. |
| Player deletion | Local archive/delete existed, but cloud deletion lacked equivalent history/owner restrictions. | Owner-only deletion/archive enforcement, server historical-reference checks, disabled destructive action for visible history, historical frozen squads preserved, alphabetical/role sorting. Archiving keeps memberships for restoration and historical identity. |
| Startup/navigation | Cached startup, session-request deduplication and incremental synchronization already existed. Heavy screens were eagerly imported and team statistics recalculated on unrelated renders. Service worker treated component requests as ordinary HTML URLs. | Preserve immediate cached rendering/background validation; lazy-load match/profile/statistics/settings screens; memoize team statistics only on the dashboard; distinguish Next.js Flight requests from cached documents; observe local list changes without removing stale-tab scoring protection. |
| UI | Missing lifecycle sections, misleading status labels, unlabelled dialogs and limited narrow-screen safeguards. | Live/upcoming/draft sections, compact status/date/venue cards, cancelled tab, useful empty states, no scores before a scheduled match starts, named native dialogs, keyboard focus indicators, wrapping controls, reduced-motion support. |

## Data and permission behavior

- New MongoDB `loginAttempts`: hashed normalized identifier as `_id`, `failures`, `lockedUntil` (epoch milliseconds), `revision`. No TTL: a partial consecutive-failure count must not disappear on its own.
- New MongoDB `rateLimits`: hashed scope/key/window `_id`, `count`, `expiresAt`; TTL index on `expiresAt`. Window arithmetic enforces limits independently of TTL cleanup timing.
- Existing IndexedDB stores/version are retained. `scheduledAt`, draft `scheduleForLater`, and local `deletedAt` are additive record fields. Existing MongoDB SyncRecord Mixed data supports these fields.
- Successful authentication resets consecutive failures. An expired lock starts a fresh count. A locked account rejects even a correct password until expiry. Unknown account identifiers follow the same failure/lock behavior.
- Sync requests remain scoped by the authenticated account. Viewers cannot push. Match/player/team/draft/roster deletions and archive changes require the owner. Server tombstones cannot be overwritten by a stale device.
- Pending deletion is retained through failed synchronization and stale pulls until acknowledged. A conflicting newer server revision remains a visible sync conflict; unsynchronized local data is not discarded automatically.
- Completed-match snapshots remain locally and in cloud soft-deleted records. There is no new end-user undelete interface; recovery is an administrative operation.
- Live scoring continues to use revision checks. Cross-tab list refresh deliberately excludes the scoring screen, preserving rejection of a stale second scorer.

## Validation and measurements

- `npm.cmd --prefix frontend test`: **44 passed, 0 failed**. Includes cricket engine/scorecard/statistics regression coverage, failure threshold/expiry/reset/concurrency, draft lifecycle and backups, upcoming filtering/sorting, offline tombstone persistence/acknowledgment, archive preservation, and deletion authorization policy.
- `npm.cmd --prefix frontend run build`: successful Next.js webpack production builds; 40 routes generated; latest precache includes 95 resources. No new packages.
- `npm.cmd --prefix frontend run test:e2e`: **9 passed, 0 failed** in the final production run (46.7 seconds), including the deterministic lock countdown test.
- Development cached-account/navigation test: **1 passed**, using the existing development server at `http://localhost:3000` without stopping it. Reproduce with `CREASE_TEST_DEV=1`, `CREASE_TEST_URL=http://localhost:3000`, and `npm --prefix frontend run test:e2e -- tests/browser/upgrade.spec.js --grep "cached account"`.
- Local cached-dashboard observation: **267 ms production** in the final run (162?267 ms across verification runs), **1,085 ms development**. The test delays `/api/auth/me` by 2,500 ms, verifies rendering before its response, observes one startup auth request, and verifies internal navigation preserves a window marker. These are local verification observations with mocked authentication, not production network benchmarks or before/after improvements.
- Responsive scenario checks **320, 375, 390, 430, 768, 1024, 1440 px** for horizontal overflow and dialog bounds. Existing browser tests also cover scoring, players, settings, backups and offline first visits. Screenshots are generated under `frontend/test-results/`.
- Real browser offline scoring, reload persistence, stale second-tab rejection, scorecards, and PWA precache checks pass in the production suite.
- Windows initially blocked worker creation (`spawn EPERM`); approved execution outside that process restriction ran the actual test/build commands. No test outcome is inferred from that initial failure.

## Limits and deployment requirements

- Live Atlas authentication, limiter persistence across actual Vercel instances, recovery email delivery, and multi-device cloud deletion were **not exercised against a real backend**. Login CAS/concurrency tests use a shared atomic store adapter; sync tests use IndexedDB and mocked HTTP. Perform a staging integration check before production rollout.
- Use the existing `MONGODB_URI` and strong `SESSION_SECRET` on Vercel. The database user needs read/write and index-creation permissions for the two new collections. Verify the TTL index exists; no destructive migration is required.
- Recovery still needs the existing `RESEND_API_KEY`, configured sending domain, and correct `NEXT_PUBLIC_BASE_URL`.
- The limiter reads Vercel's trusted client-IP header when `VERCEL` is set. Outside Vercel, the reverse proxy must sanitize `X-Forwarded-For`; do not expose the origin behind an untrusted forwarding header.
- Deploy using the existing build command, including `scripts/precache.mjs`, so HTML and asset caches correspond to the same build. API/auth responses remain outside service-worker caching.
- Offline Next.js component navigation can fall back to a cached full document; online navigation is tested without a document reload.
- No Lighthouse, real Atlas latency, production-user telemetry, Safari/iOS device testing, or full assistive-technology audit was performed. The dashboard still reads its local scorebook for aggregate statistics; very large histories need separate profiling.
- Login attempt rows intentionally persist until their next successful/expired-lock update; establish operational retention policy if unknown-identifier traffic creates significant storage growth without weakening active locks.

## Files

New implementation: `backend/loginAttempts.js`, `backend/syncPolicy.js`, `lib/matchLifecycle.js`.

Modified backend/API: `backend/models.js`, `backend/rateLimit.js`, `app/api/auth/login/route.js`, `app/api/auth/recovery/request/route.js`, `app/api/auth/recovery/reset/route.js`, `app/api/account/password/route.js`, `app/api/account/team-id/route.js`, `app/api/sync/push/route.js`.

Modified local data/UI: `lib/db.js`, `components/App.jsx`, `components/Setup.jsx`, `components/Match.jsx`, `components/People.jsx`, `components/Profile.jsx`, `components/Settings.jsx`, `components/TeamAccountMenu.jsx`, `components/AccountLogin.jsx`, `components/ui.jsx`, `app/globals.css`.

Worker/test configuration: `scripts/sw-template.js`, `playwright.config.js`, `tests/browser/offline.spec.js`.

New tests: `tests/login-attempts.test.js`, `tests/lifecycle.test.js`, `tests/player-archive.test.js`, `tests/sync-policy.test.js`, `tests/browser/upgrade.spec.js`.

All paths above are relative to `frontend/`. This report is `frontend/Docs/UPGRADE-REPORT.md`.

Implementation references: MongoDB documents [single-document atomic updates with expected-value filters](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/); Vercel documents its [request headers](https://vercel.com/docs/headers/request-headers).
