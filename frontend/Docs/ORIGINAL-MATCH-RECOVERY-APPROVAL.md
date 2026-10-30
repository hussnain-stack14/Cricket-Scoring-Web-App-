# Original match recovery approval checklist

This is an owner-authorized, one-time repair for match
`790a460b-a998-489d-9401-52f94fb051fa` in the immutable account partition
`CRS-353209`. It must not be used as a general undelete feature.

## Preconditions

1. Rotate any MongoDB password that was exposed outside the secret store, then update the preview
   and production environment variables there. Do not commit it.
2. Export a new backup from the source device and retain the verified mobile backup unchanged.
3. Run `npm run plan:match-recovery -- --mobile <backup> --team-id CRS-353209 --match-id 790a460b-a998-489d-9401-52f94fb051fa` with a read-only Atlas credential.
4. Require `readyForOwnerApproval: true`, no validation errors or conflicts, exactly 301 events,
   and the replayed results 145/10 (18.4) and 146/6 (16.2).
5. Record the printed recovery fingerprint and proposed revisions. Re-run the preflight immediately
   before approval; any changed revision cancels the attempt.

## What the owner-authorized operation can change

The feature-gated endpoint accepts only a complete verified backup history and an exact confirmation
phrase containing its SHA-256 recovery fingerprint. It runs a MongoDB transaction that:

- creates only absent event IDs;
- restores only matching tombstoned match, innings, and event records at their expected revisions;
- leaves already-active, byte-equivalent records unchanged;
- does not create or modify players, teams, memberships, drafts, or audits;
- restores child history before the match commit marker;
- replays the stored children server-side and writes completion only if both innings finish and all
  301 events are present.

Any payload difference, stale revision, unexpected active child, failed replay, or invalid owner
session aborts the whole transaction. No partial recovery is committed.

## Preview deployment

1. Deploy the code to Preview without `MATCH_RECOVERY_ENABLED`; the endpoint remains `404`.
2. Use a dedicated test account and synthetic completed match to test the normal sync routes.
3. In an isolated preview environment only, set `MATCH_RECOVERY_ENABLED=true` and exercise the
   recovery endpoint with a test backup. Verify transaction rollback by deliberately using an
   incorrect fingerprint and a changed record payload.
4. Confirm a second isolated workspace pulls the recovered test match and has one match, two
   innings, the expected event count, and the same engine replay.
5. Remove the preview feature flag after the exercise.

## Production approval and rollback

1. Obtain explicit owner approval after reviewing a fresh preflight result.
2. Deploy the reviewed build with `MATCH_RECOVERY_ENABLED` still unset. Normal synchronization is
   available, while recovery remains disabled.
3. Before the one-time operation, take a read-only Atlas export of the affected `syncRecords`
   documents and retain both device backups.
4. Temporarily enable `MATCH_RECOVERY_ENABLED` only for the approved operation. Keep normal
   writes paused for this match while the preflight/recovery/pull verification runs.
5. Re-run the preflight, submit only its exact fingerprint-confirmed history as the account owner,
   then disable the flag immediately.
6. If the endpoint reports a conflict or error, do not retry with altered payloads. Disable the
   flag and investigate the new preflight; the transaction guarantees no partial write.
7. If a post-commit operational rollback is required, do not delete documents. Preserve the
   resulting history, export diagnostics, and use a separately reviewed revision-aware corrective
   operation.

## Two-device verification

1. On Device A, retain its local backup and synchronize until the recovery result is acknowledged.
2. On Device B, do not clear IndexedDB. Sign in using either the public Team ID or the immutable
   workspace key, then trigger normal sync.
3. Verify both devices contain the same original match ID, two innings, and 301 event IDs with
   sequences 1–301.
4. Replay both scorecards: Royal club 145/10 in 18.4; Chota latiyawala 146/6 in 16.2; Chota
   latiyawala won by four wickets.
5. Verify team/player statistics count the original match once, and check there are no duplicate
   match IDs, players, or event IDs.
