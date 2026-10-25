# Sync, sign-out, accuracy, and leaderboards upgrade

## Configuration finding

On 25 October 2026 this checkout had no `frontend/.env.local`, `SESSION_SECRET`, or `MONGODB_URI` in the development process. The reported authentication configuration error is therefore accurate: account login, `/api/auth/me`, Atlas connectivity, and cloud synchronization cannot succeed locally until environment-specific values are configured. No secret or URI was created, displayed, changed, or committed. See `.env.example` and `Docs/SYNC-OPERATIONS.md`.

Because no real authenticated browser tab, Atlas connection, actual match ID, or supplied PDF file was available in this environment, the 23 queued operations and the Royal club vs Chota latiyawala history could not be classified as valid, duplicate, rejected, or server-missing. The new read-only **Export sync diagnostics** action records the current account/workspace mapping, pending operation metadata, local visible/stored record counts, conflicts, and rejection reasons without exporting scoring payloads, clearing the queue, or starting sync.

## Synchronization and sign-out

- Synchronization is single-flight per workspace, binds push/pull/logout requests to the intended internal account key, retains server rejection reasons even when the server has no conflicting record, and only clears a queued record after a matching table, record ID, change ID, and advancing revision are acknowledged.
- A network/API failure remains a pending queue; a 401/409 becomes an explicit reauthentication state. Neither case signs the user out or removes local changes.
- Account cleanup now rechecks the sign-out lock, pending queue, and conflicts inside its transaction. It cannot clear a cache with unsynced operations.
- A scorer-created draft is allowed to be consumed only when a verified server-side match record references that exact draft and teams. Normal draft deletion remains owner-only.
- Automatic sync remains background-only: initial active-app sync, reconnect, visible-tab refresh, and a 45-second active-tab poll. It never blocks score entry.

## Cross-device completed matches

The likely failure mode behind a completed partial chase was that a match parent could reach another device ahead of its remaining delivery records. A completed match now carries an innings/event snapshot count. Client upload sends innings/events before the completed parent; the server rejects an incomplete completion safely; a receiving device holds final status until all declared child records have arrived. During that interval it presents the match as live rather than completed. The pull cursor remains in place so completion retries automatically.

This prevents the reported 145/10 then 72/3 completed presentation from becoming authoritative. It does not repair an already-corrupt remote record automatically: use the diagnostics export and the original scoring event history to determine the authoritative sequence before correction. Player names are not merged; all rankings and history use stable player IDs.

## Accuracy and interface

- Team statistics only count two completed, finished innings. A completed record missing scorecard children is explicitly flagged and excluded until synchronization finishes, instead of quietly reporting it as a valid zero-match result.
- PDF sections may now split between pages and repeat table headers, avoiding mostly empty pages caused by whole-section page avoidance.
- Added Top 20 Batters, Bowlers, and All-Rounders from completed IndexedDB records with team, format, period, tournament, ranking, and rate-qualification filters. Rankings are deterministic, support shared ranks, retain archived-player history, cap at 20, and use legal balls for bowling rates. All-Rounder ranking is labelled `Crease points = runs + 20 × wickets`.
- Mobile leaderboards use compact expandable rows; desktop uses aligned tables with gold/silver/bronze rank accents. Profile/account menus close on outside click, Escape, toggle, and when another header popover opens.

## Validation

- `npm.cmd --prefix frontend test`: **61 passed, 0 failed** after the changes, including lost-response retry, pending queue preservation, account mismatch, diagnostics metadata, verified draft consumption, acknowledgement identity, completed snapshot deferral, ranking cap, ties, qualification, archived players, and cricket calculations.
- `npm.cmd --prefix frontend run build`: production build completed successfully before browser testing.
- Targeted Playwright: **6 passed** for authentication states, diagnostics export, account security, dropdown dismissal at 320/430/1024 px, and mobile leaderboard controls. The existing upgrade browser scenarios also passed **3/3** in fresh contexts, including cached dashboard rendering in 205 ms while background authentication was delayed.

A combined 18-test browser run exposed non-reproducible service-worker/browser state leakage before the upgrade scenarios; both failed scenarios passed when rerun in fresh contexts. No production data was accessed or changed.

## Remaining limitations

Real Atlas credentials and the referenced PDF/match records are required to trace the exact 23 pending changes and determine whether the missing second-innings events exist on Device A, Device B, or the server. A two-browser-context integration test against a configured non-production account remains necessary before claiming real-time multi-device synchronization. Safari/iOS and a full assistive-technology audit were not run.

## Production incident forensic command

The `SyncRecord` schema uses `teamId`, `table`, `recordId`, `data`, `revision`, `lastChangeId`,
`deletedAt`, `createdAt`, and `updatedAt`. It does not use `recordType`, `record`, or `accountId`.
Valid tables are `players`, `teams`, `memberships`, `matches`, `innings`, `events`, `audits`, and
`drafts`.

From a protected environment with the existing `MONGODB_URI` configured, run:

```sh
npm --prefix frontend run inspect:match-sync -- --team-id <teamId> --date 2026-10-25
```

This read-only command selects only the named match under that account/date and emits metadata,
child counts, revisions, and replayed score totals. It never writes, deletes, repairs, prints raw
delivery payloads, or reveals the MongoDB URI.
