# Crease validation

Last verified: 22 October 2026

## Automated checks

| Check                         | Result                  | Evidence                                                                                                                                               |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm.cmd test`                | Passed: 25 tests        | Scoring engine, scorecards/PDF, team statistics, CSV escaping, IndexedDB, migrations, backups and safe record deletion                                 |
| `npm.cmd run build`           | Passed                  | Next.js 16 production build includes server API routes and generates the service worker/icons; 87 app routes and static assets precached               |
| `npm.cmd run test:e2e`        | Passed: 4 tests         | Chromium checks offline scoring/persistence, IndexedDB error recovery, responsive layouts, install controls and production precache/update behavior    |
| MongoDB connection retry      | Passed (simulated)      | First connect rejected; the next call retried after the cached promise was cleared                                                                     |
| Local auth/session smoke      | Passed (limited)        | Registration/login returned expected 503 without MongoDB; a sealed test session resumed at `/api/auth/me` and logout cleared its cookie                |
| `git diff --check`            | Passed                  | No whitespace errors                                                                                                                                   |
| Vercel Production environment | Blocked: not configured | Vercel reports no Production environment variables; `MONGODB_URI` and `SESSION_SECRET` are absent                                                      |
| Live database/auth smoke test | Blocked                 | Production logs explicitly report that `MONGODB_URI` is not set; no Atlas URI is available to validate credentials, permissions, DNS or network access |

The production build and browser tests run locally. They do not deploy changes or
prove a live MongoDB connection. The local auth check did not create an account
or exercise a real credential login because no database URI was available. No
deployment was performed.

## Server-side accounts and deployment

- Vercel is configured for the standard Next.js framework deployment. `npm start`
  runs `next start`; the build does not produce a static-only export.
- Configure `MONGODB_URI` and `SESSION_SECRET` in the Vercel **Production**
  environment, then redeploy after reviewing the settings. Use a valid Atlas
  connection string and a database user with read/write access to the selected
  database. `SESSION_SECRET` must be randomly generated and at least 32
  characters. Neither value should use a `NEXT_PUBLIC_` prefix.
- Team registration creates a `TeamAccount` and its owner `TeamMember` in one
  MongoDB transaction. The Atlas deployment must support transactions.
- The Vercel Production environment was queried and contains no variables.
  Recent registration function logs show:

  ```text
  MONGODB_URI environment variable is not set. Add it to .env.local for development and to Vercel environment variables for production.
  ```

- Until the variables are configured, Atlas credentials/database permissions,
  cluster DNS resolution, Atlas network access, and successful registration,
  login, session persistence and logout cannot be verified against production.

## Offline and scoring validation

- Scoring continues to store cricket records in browser IndexedDB. The offline
  acceptance test creates and scores a match, reloads it without network access,
  and confirms local data remains available.
- The production build generates the 192px/512px icons and the service worker
  from Next.js prerendered app routes and static assets. The worker excludes
  API/account requests from its offline cache.
- Browser tests verify service-worker readiness, previously unvisited scoring
  routes while offline, service-worker update activation and local match data
  surviving that update.
- Physical Android/iOS installation, native install prompts and standalone
  lifecycle behavior have not been tested.

## Team statistics and exports

- Team statistics are derived from finalized match snapshots and filtered by
  stable team ID. Live, reopened and incomplete matches do not contribute.
- Batting average divides runs by dismissals; strike rate uses balls faced.
  Averages with no dismissals and rates without a denominator remain undefined.
- Bowling overs use cricket notation. Bowling average, economy and strike rate
  use wickets and legal balls; byes and leg-byes are excluded from bowler runs.
  A dot ball is a delivery with no runs charged to the bowler.
- Top-player lists use the labeled Crease Performance Score and visible
  qualification thresholds; they are not presented as official rankings.
- CSV and completed-match scorecard PDFs are generated locally in the browser.
  Result-only and unfinished-match reports retain the browser print flow.
- Player of the Match is not recorded, so scorecards do not assign an award.
  Ties use the scoring engine's supported result; abandoned, forfeited and
  no-result outcomes are not supported.
- No-result matches are not supported by match scoring, so team overview
  no-result totals remain zero.

## Known boundaries

- Initial offline preparation and asset updates require an internet connection.
- Scoring data is local to a browser profile/device. Optional team accounts and
  server sync do not replace IndexedDB as the scoring store. Separate devices
  have separate local records until accounts/sync are configured and used.
- Browser clearing, storage eviction or device loss can remove local data;
  export backups and keep them outside the browser.
- Scoring follows the supported subset in [RULES.md](./RULES.md); unsupported
  cricket variations are listed there and are not automatically calculated.
- Physical-device accessibility, installation and storage-eviction behavior
  remain manual checks.
