# Crease validation

Last verified: 22 October 2026

## Automated checks

| Check                                            | Result                    | Evidence                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                                   | Passed: 17 tests          | Scoring engine, IndexedDB repositories, workspace isolation, revision conflicts, transaction rollback, migration, playerless match creation and dynamic roster, backup validation/restoration, and safe record deletion |
| `npm.cmd run build`                              | Passed                    | Next.js static export includes the landing page, seven `/app/` routes, legacy routes and 116 precached resources                                                                                                        |
| `npm.cmd run test:e2e`                           | Passed: 2 tests           | Production Chromium acceptance covers one-tap runs, the delivery-type/run sheet and automatic penalties, wicket selection, undo, offline match flow, install fallback, manifest/icons, and complete precache            |
| `npx.cmd vercel build --yes --target production` | Passed                    | Vercel static output contains `sw.js`, both PNG icons, all exported routes and configured response headers                                                                                                              |
| Live production smoke test                       | Passed                    | `https://crease-scoring.vercel.app/`: worker/icons returned 200; precache verified with 0 missing assets; new match created, scored and reloaded while network was disabled                                             |
| `npm.cmd audit`                                  | Passed: 0 vulnerabilities | npm audit reported no known dependency vulnerabilities                                                                                                                                                                  |
| Prettier and `git diff --check`                  | Passed                    | Formatting check and whitespace validation completed without errors                                                                                                                                                     |

The browser tests use Chromium and the production static export. They verify
that the worker explicitly reports every precache resource available before
marking offline readiness. They also simulate the browser install-prompt and
`appinstalled` events; this validates application event handling, not the
native Chromium prompt itself. A separate fresh browser profile tested the
deployed website: it created a workspace and match, recorded a run, and
reloaded that score with network access disabled. The scoring test also
simulates an IndexedDB write failure and confirms the user's unsaved input
remains available.

## PWA and offline status

- The manifest declares the Crease name, `/app` start URL, standalone display
  mode, and 192px and 512px icons. The production build generates these icons
  and precaches exported routes, scripts, styles, and icons.
- Chromium verified first-run precache readiness, navigation to previously
  unvisited screens while offline, scoring while offline, reload/resume, an
  update waiting for explicit activation, and local match data surviving that
  asset-cache update.
- The browser test checks layout overflow at 320px, 390px, 430px, and 1200px.
- The live deployment was inspected before and after the fix. Initially the
  manifest and app routes returned 200, but `/sw.js` and both icon paths
  returned 404; Chromium logged the service-worker registration failure. The
  Vercel project used its Next.js default output while this app generates the
  PWA worker/icons in the static export's `out/` directory. `vercel.json` now
  runs the production build and deploys `out/` as static output. After
  deployment, the worker and icons return 200, root worker scope is allowed,
  and live precache verification reports no missing assets.
- Physical Android/iOS installation, native install prompts, and standalone
  lifecycle behavior have **not** been tested. The browser automation did not
  receive a native `beforeinstallprompt`; it verified the fallback guide and
  simulated the browser prompt lifecycle. Chromium automation is not evidence
  of physical-device installation.
- The service worker and PNG icons are generated in `out/` after the static
  export. The development server does not serve `/sw.js` or the generated
  icons; run the production build to verify PWA behavior. The landing page
  identifies development mode rather than reporting a misleading registration
  error.

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
