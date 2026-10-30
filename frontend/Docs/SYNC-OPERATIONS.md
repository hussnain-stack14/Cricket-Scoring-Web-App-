# Sync operations

Each environment requires its own `MONGODB_URI` and a distinct random `SESSION_SECRET` (at least 32 characters). Keep those values server-only; never copy a development or Preview credential to Production.

## Two-device diagnostic collection

When a device reports pending changes, use **Account settings → Export read-only sync diagnostics**. The sign-out safeguard provides the same control. The download is read-only: it neither starts a sync nor clears/retries the queue. It excludes database credentials, delivery payloads, and player names. It retains opaque record IDs only where needed to reconcile a specific pending operation or conflict, along with account/workspace mapping, counts, cursor, sanitized error state, operation types/statuses, revisions, queue timing, and one-way record fingerprints.

Export one file on each affected browser before changing either queue. Compare them locally with:

```powershell
npm --prefix frontend run compare:sync-diagnostics -- "C:\path\browser-a.json" "C:\path\browser-b.json"
```

The comparison is read-only. It flags account-key mismatches, pending operations unique to either browser, revision/status differences, deletion tombstones, rejected/conflicted operations, and stalled-upload signals. Exports from diagnostic schema 1 can still be inspected but cannot safely compare individual pending records; re-export both browsers after schema 2 is released.

## Safe release and rollback

1. Verify the change in Preview, including an export from two Preview browser profiles and the comparator output.
2. With explicit approval, deploy the same build to Production. Do not clear site data, IndexedDB, caches, or pending operations. The Dexie metadata fields are optional and backward-compatible.
3. On each affected Production browser, reload normally until the new service worker/app version activates, then export diagnostics. A normal update at the same origin preserves IndexedDB.
4. If rollback is necessary, alias the prior server deployment. Do not clear browser storage; the new diagnostic metadata is ignored by the prior sync code. Re-export diagnostics before any further recovery decision.

Never automatically resurrect a tombstone, overwrite a newer cloud revision, or discard a queued operation. Resolve only evidence-backed conflicts after both device exports and backups have been retained.

Completed match snapshots are now committed after their innings and deliveries. A receiving device defers a completed parent until its locally pulled child records reach the declared snapshot count, preventing a completed partial chase from being presented as authoritative.
