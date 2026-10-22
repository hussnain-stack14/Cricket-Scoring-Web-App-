# Crease validation

Last verified: 22 October 2026

## Automated checks

| Check                           | Result                    | Evidence                                                                                                                                                                                                                |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                  | Passed: 17 tests          | Scoring engine, IndexedDB repositories, workspace isolation, revision conflicts, transaction rollback, migration, playerless match creation and dynamic roster, backup validation/restoration, and safe record deletion |
| `npm.cmd run build`             | Passed                    | Next.js static export includes the landing page, seven `/app/` routes, legacy routes and 116 precached resources                                                                                                       |
| `npm.cmd run test:e2e`          | Passed: 1 test            | Production Chromium acceptance covers the landing page, offline preparation and navigation, playerless match creation, dynamic players, scoring, persistence, backups, updates and mobile widths                        |
| `npm.cmd audit`                 | Passed: 0 vulnerabilities | npm audit reported no known dependency vulnerabilities                                                                                                                                                                  |
| Prettier and `git diff --check` | Passed                    | Formatting check and whitespace validation completed without errors                                                                                                                                                     |

The browser test uses Chromium and the production static export. It exercises
offline use after the service worker reports complete precache readiness. It
also simulates an IndexedDB write failure and confirms the user's unsaved input
remains available.

## PWA and offline status

- The manifest declares the Crease name, `/app/` start URL, standalone display
  mode, and 192px and 512px icons. The production build generates these icons
  and precaches exported routes, scripts, styles, and icons.
- Chromium verified first-run precache readiness, navigation to previously
  unvisited screens while offline, scoring while offline, reload/resume, an
  update waiting for explicit activation, and local match data surviving that
  asset-cache update.
- The browser test checks layout overflow at 320px, 390px, 430px, and 1200px.
- Physical Android/iOS installation, native install prompts, and standalone
  lifecycle behavior have **not** been tested. Chromium automation is not
  evidence of physical-device installation.

## Known boundaries

- Initial installation and updates require an internet connection. Complete
  offline preparation before relying on the app at a match.
- Local data belongs to a browser profile on one device. Separate devices or
  browser profiles have separate records; people sharing a browser profile
  share its records. There is no account or synchronization.
- Browser clearing, storage eviction, or device loss can remove local data.
  Export backups and keep them outside the browser.
- Scoring follows the supported subset in [RULES.md](./RULES.md); unsupported
  cricket variations are listed there and are not automatically calculated.
- Physical-device accessibility, installation, and storage-eviction behavior
  remain manual checks.
