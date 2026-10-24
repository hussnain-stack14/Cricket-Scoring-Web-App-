# Crease Match Centre and scheduled-match upgrade

Implemented locally on 24 October 2026. Existing Next.js routes, JavaScript/JSX, MongoDB, Dexie stores, authentication, and cricket calculations are retained. No dependencies, destructive migrations, commits, pushes, or deployments were added.

## Match Centre

- Compact status, teams, format, schedule/date, and venue header. Reports, sharing, venue editing, reopening, and deletion are grouped under More actions. Deletion and reopening retain explicit confirmation and owner restrictions.
- Accessible Score / Scorecard / History tabs support arrows, Home/End, selected state, focus, and a linked panel. The selected view survives reload through the URL. Completed matches open on Scorecard by default.
- Compact green scoreboard, run rate, partnership, target/balls remaining, and chase requirement. Mobile batting/bowling tables wrap long names, keep figures aligned, and highlight the striker.
- Search for larger player lists, explicit striker/non-striker/bowler confirmation, add-player actions, disabled scoring while lineup is incomplete, 0-6 run buttons, wicket, undo, extras, and delivery correction.
- Current-over chips open the existing correction flow. Corrections retain their confirmation and audit; they do not silently edit history.
- Venue editing is available before completion; scheduled fixtures also retain reschedule/cancel controls. Sharing uses the browser share sheet or copies a summary.

## Skeletons and motion

`components/Skeletons.jsx` supplies Skeleton, MatchCardSkeleton, PlayerCardSkeleton, TeamCardSkeleton, TableSkeleton, ScoreboardSkeleton, MatchCentreSkeleton, DashboardSkeleton, StatisticsSkeleton, and the screen dispatcher. Dashboard, match lists, players/teams, profile, match/scorecard, statistics, and account/member loading use content-shaped placeholders.

Only the placeholder is debounced by 120 ms. Local data renders immediately when ready; there is no minimum loading duration or artificial data delay. Fast cached loads avoid a skeleton flash. Skeletons are hidden from assistive technology behind one loading status.

CSS provides subtle skeleton pulse, button press/hover feedback, menu/modal/tab entry, score updates, four/six highlights, wicket/over feedback, and completed-result entry. Feedback never blocks scoring. Reduced motion disables the added animations and press transforms. No animation library was added.

## Upcoming, toss, and start workflow

1. Schedule the match without choosing a toss or opening players. Date/time is stored as an ISO instant with the originating time zone.
2. Choose the toss winner, then bat or bowl first.
3. Select two distinct opening batters and an eligible bowler; add roster players if needed.
4. Review teams, rules, toss, batting/bowling sides, and lineup.
5. Start Scoring explicitly when due. An owner can opt into early start only when that match's rule allows it.

Due and overdue fixtures remain discoverable until started or cancelled. Time passing never starts scoring automatically. Cards show View Details, Start Match, Resume Setup, Resume Match, or View Scorecard as applicable. Each setup step persists locally and resumes after an offline reload. Live matches resume play without repeating the toss; cancelled fixtures display their record without scoring controls.

Starting validates team membership, active players, distinct batters, squad limits, batting order, role, and scheduled time. One IndexedDB transaction saves the opening innings, immutable start identity, toss, live status, and sync queue. Revision checks reject a stale concurrent start; retrying the same start identity is idempotent.

## Offline and synchronization

- Toss, decision, lineup, player additions, and start work locally. Account workspaces queue changes for synchronization; guest workspaces remain local.
- Match starts push before their innings/events. The server rejects replacing an accepted start identity and rejects child records from another start.
- A parent start snapshot supplies the initial lineup during incremental synchronization; cricket delivery arithmetic is unchanged.
- Stale pulls preserve pending local setup and play. Incoming child records from a different start are deferred, with the pull cursor retained for retry.
- Two genuinely independent offline starts require manual review. Both versions are preserved, and automatic conflict replacement is blocked rather than mixing deliveries. A merge/reconciliation UI for those exceptional competing scorebooks is not included.
- Existing seven-failure, ten-minute MongoDB login locking, account isolation, deletion tombstones, and draft consumption behavior remain covered by regression tests.

## Player and team management

Archive/restore now asks for confirmation. Player profiles expose contextual management actions. Historical records cannot be permanently deleted; archiving preserves match snapshots and statistics. Removing an unused team leaves its players intact. Match deletion remains a confirmed action with the existing local/cloud tombstone behavior.

## Performance and validation

No new network dependency or package was introduced. Dynamic feature loading remains in place; local data and background session validation remain separate. Match replay is memoized so transient scoring feedback does not replay unchanged innings.

- `npm.cmd --prefix frontend test`: **48 passed, 0 failed**. Includes scoring/undo/extras, statistics, authentication lock concurrency, migration preservation, draft/delete/archive behavior, toss derivation, due/early permission checks, invalid-start rollback, duplicate starts, stale pulls, and start-record isolation.
- `npm.cmd --prefix frontend run build`: **passed**. Next.js generated 40 static pages and precached 95 resources. Final asset-cache version: `c2d1dbc638eb9da2`.
- `npm.cmd --prefix frontend run test:e2e`: **13 passed, 0 failed** in the final production run (1.1 minutes). This includes the corrected tablet dialog and the dedicated player-search workflow.
- Cached dashboard visible in **177 ms** in that run, with authentication deliberately delayed by 2,500 ms. The test verifies one background auth request and navigation without a document reload; this is a mocked-auth local observation.
- Browser coverage includes seven widths: **320, 375, 390, 430, 768, 1024, 1440 px**; overflow and menu/dialog bounds, long player names, keyboard tabs, reduced motion, slow database loading, cached loading without skeleton flash, offline toss/start/reload, scoring, player/team archive/restore, completed scorecards, backups, and service-worker updates. Screenshots are generated in `test-results/`; 320, 390 and 1440 px Match Centre images were visually reviewed.
- Initial runs exposed outdated workflow selectors plus a real tablet dialog-centering animation issue; these were corrected. Player-search reset now has dedicated end-to-end coverage.
- Windows worker spawning initially required approved execution outside the process restriction. The results above are from actual completed test/build runs, not the blocked attempt.

These are local verification measurements, not production benchmarks. No real network-latency or Lighthouse improvement is claimed.

## Files changed for this upgrade

Paths are relative to `frontend/`.

- New UI: `components/MatchHeader.jsx`, `components/PreMatch.jsx`, `components/Skeletons.jsx`.
- UI integration: `components/Match.jsx`, `components/App.jsx`, `components/Setup.jsx`, `components/AccountSettings.jsx`, `components/People.jsx`, `components/Profile.jsx`, `components/ReportActions.jsx`, `components/ui.jsx`, `app/globals.css`.
- Persistence and policy: `lib/matchLifecycle.js`, `lib/db.js`, `lib/sync.js`, `lib/engine.js`, `backend/syncPolicy.js`, `app/api/sync/push/route.js`.
- New tests: `tests/prematch.test.js`, `tests/browser/match-centre.spec.js`.
- Updated regression expectations: `tests/lifecycle.test.js`, `tests/browser/offline.spec.js`, `tests/browser/upgrade.spec.js`.
- This report: `Docs/MATCH-CENTRE-UPGRADE.md`. Pre-existing changes in `Docs/UPGRADE-REPORT.md` were retained.

## Limits

Live Atlas/multi-instance integration was not exercised. Sync tests use IndexedDB plus mocked HTTP and policy checks; browser tests verify actual local/offline persistence. Safari/iOS, real device performance, Lighthouse, and a full assistive-technology audit were not run. Existing revision-conflict review remains necessary when two devices independently score the same fixture; this upgrade prevents their records from being silently combined.
