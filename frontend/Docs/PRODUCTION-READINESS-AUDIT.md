# Crease production-readiness audit

Audited 26 October 2026. This is an evidence-based repository audit, not a claim that the
production account or both reported devices were inspected.

## Phase 1 — critical reliability

### Verified in code and tests

- Offline records are stored in Dexie tables and scoring events have UUIDs, `matchId`,
  `inningsId`, and ordered `seq` values. A local transaction writes an event and its durable
  pending operation together.
- Pending operations retain their stable `changeId` across failed requests. They are removed only
  after a matching server acknowledgement with an advancing revision.
- The Mongo `syncRecords` partition is `teamId`; the unique server key is
  `(teamId, table, recordId)`. Push and pull bind the requested workspace to the authenticated
  account.
- Repeated pushes are idempotent through `lastChangeId`; stale revisions become preserved
  conflicts rather than silent replacement.
- A completed match is now a commit marker, not the score authority. The server loads the
  account-scoped innings/events and replays them with the scoring engine before accepting
  completion. A receiving client applies the same verification before displaying completion.
- A deferred completion keeps its pull cursor unchanged and reports `Sync incomplete`.
- Sign-out refuses local cleanup while pending changes or conflicts remain. Backups validate IDs
  and relationships before import.
- Authentication uses bcrypt, secure/httpOnly production session cookies, request rate limiting,
  and the tested seven-failure/ten-minute account lock.

### P0 — production blockers

1. **The Royal club vs Chota latiyawala production history is not verified.** This checkout has no
   `frontend/.env.local` or process `MONGODB_URI`, and Device A is unavailable. The read-only
   diagnostic must determine whether match `790a460b-a998-489d-9401-52f94fb051fa` replays to
   146/6, 72/3, or conflicting histories before recovery is attempted.
2. **A MongoDB credential previously appeared in `.env.example`.** It has been replaced by a
   placeholder, but the corresponding Atlas user password must be rotated outside this repository.
   This is an operational security action, not a code-only fix.

### P1 — required before public launch

1. Run the two-device scenario against a non-production account, including offline scoring,
   reconnect, duplicate delivery retries, stale pulls, conflict preservation, and completion.
2. Run the read-only production diagnostic for the affected account and follow the evidence-based
   recovery path; never synthesize deliveries.
3. Add production security headers (at least frame protection, MIME sniffing protection, referrer
   policy, and a reviewed CSP). Current Vercel headers configure cache policy only.
4. Add operational monitoring and alerting for API failures, sync rejection/conflict rates, PWA
   precache failures, Mongo connectivity, and backup/import failures. None is configured here.
5. Complete a real installed-PWA version-transition test. The worker lifecycle is implemented, but
   browser/device update behavior varies and must be verified on target mobile browsers.
6. Review authorization and input validation for every API route as a separate security pass;
   existing auth tests cover important paths but are not a penetration test.

### P2 — planned product work

- Retired hurt/out, DLS, super overs, and mid-over bowler substitution are intentionally outside
  the currently documented cricket rule contract. They require rule design and test vectors before
  implementation.
- Tournament management, public live sharing, privacy/terms workflows, account-deletion policy,
  feedback, and operational support tooling are not implemented in this repository.
- Data pagination and larger-club performance testing are not yet demonstrated.

### P3 — optional enhancements

- Device diagnostics upload with explicit user consent.
- Read-only live score distribution after authorization and privacy design.
- Advanced analytics and competition formats.

## Safe recovery runbook

1. In a protected environment, configure `MONGODB_URI` and run:
   `npm --prefix frontend run inspect:match-sync -- --team-id CRS-353209 --match-id 790a460b-a998-489d-9401-52f94fb051fa --date 2026-10-25`.
2. Export read-only diagnostics on both devices. Compare match ID, `syncSnapshot`, event/innings
   counts, revisions, cursor, pending count, and replayed totals.
3. If Atlas replays 146/6, sync Device B normally; its event history should be downloaded and
   replayed. If it does not, retain all records and wait for Device A to upload its local events.
4. If histories conflict, export backups and resolve through the preserved conflict workflow. Do
   not force a score, clear IndexedDB, delete queue entries, or overwrite the longer history.

## Validation performed in this checkout

- `npm.cmd --prefix frontend test`: 62 passing tests.
- `npm.cmd --prefix frontend run build`: successful production compilation.
- Targeted responsive Playwright: profile dismissal and mobile leaderboard controls passed.

These results validate the code paths and build; they do not replace a configured MongoDB
integration run or a real two-device production-like test.

## Credential rotation and deployment remediation

The repository scan found no live-shaped MongoDB URI in current tracked files or reachable Git
history. Because a URI was present in a local working-tree example, rotate the Atlas database user
regardless: create a new least-privilege application user or reset the existing user's password,
update `MONGODB_URI` in Vercel Production/Preview/Development environment settings, redeploy only
after an approved change window, and then remove the old Atlas credential. Keep the URI only in
Vercel environment variables and an ignored local `.env.local`; never paste it into issues,
diagnostics, logs, or `.env.example`. Verify the new deployment with a read-only diagnostic and a
new login before revoking the old credential.

The server emits privacy-conscious structured events for sync rejection/record errors to normal
server logs. They include only counts, table names, generic status/code, and timestamps—not record
payloads, team IDs, IP addresses, tokens, or exception stacks. Configure alerting from the hosting
provider around those events before launch.
