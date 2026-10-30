# Production readiness status — 28 October 2026

This report distinguishes code evidence from production/device evidence. No production write,
deployment, or recovery was performed while preparing it.

## Passed locally

- Login accepts both the public team ID and immutable workspace key only when they resolve to one
  account and the password is valid. Both aliases share the canonical account lockout key.
- Normal sync remains account-scoped by immutable workspace key. Pending operations are removed
  only after matching server acknowledgements.
- Pagination, retries, stale revision conflicts, offline persistence, reconnect behavior, and
  completed-match child-history verification are covered by automated tests.
- The recovery preflight for the original match is clean: 66 event creates, 131 explicit
  revision-checked tombstone restores, and 107 unchanged events. Its replay is 145/10 (18.4) and
  146/6 (16.2).
- Recovery is owner-only, transaction-based, fingerprint-confirmed, feature-gated, and disabled
  unless `MATCH_RECOVERY_ENABLED=true` is explicitly configured.
- Server logs emit privacy-conscious events for push rejections, per-record failures, rejected
  incomplete completions, and recovery failures/completions. They contain no account IDs, record
  payloads, credentials, tokens, IP addresses, or stacks.

## Failed or blocked

- The original match remains tombstoned in Atlas until a separately approved owner recovery.
- Atlas does not currently contain a coherent active 301-event history for the original match.
- No actual deployed-preview recovery transaction has been executed.

## Unverified outside automated tests

- Real sign-in using both aliases and the account password in Preview.
- Device A → Atlas → Device B transfer using two independent installed/browser contexts.
- Offline scoring, reconnection, duplicate request retry, conflicting edits, and stale service
  worker recovery against a Preview deployment.
- Installed PWA upgrade retaining IndexedDB and pending operations on target mobile browsers.
- Vercel alert delivery for `sync_push_rejected`, `sync_push_record_error`,
  `sync_completion_rejected`, `match_recovery_failed`, and `match_recovery_completed`.

## Preview plan

1. Rotate the Atlas password that was exposed outside secret storage and update Preview secrets.
2. Deploy the reviewed build to Preview with `MATCH_RECOVERY_ENABLED` unset.
3. Verify each alias logs into the same test account and reports the immutable workspace key.
4. Run two independent test contexts through offline scoring, reconnect, duplicate retry,
   stale-revision conflict, and completed-match pull scenarios.
5. Enable recovery only in an isolated Preview environment with synthetic data. Test successful
   recovery and deliberate fingerprint/revision failures; disable it afterward.
6. Configure Vercel log alerts for the listed events before considering production deployment.

## Production gate

Production deployment and original-match recovery remain blocked until Preview verification passes,
the user explicitly approves deployment, and the recovery preflight is rerun immediately before
the owner-authorized operation. See `ORIGINAL-MATCH-RECOVERY-APPROVAL.md` for rollback and
two-device verification steps.
