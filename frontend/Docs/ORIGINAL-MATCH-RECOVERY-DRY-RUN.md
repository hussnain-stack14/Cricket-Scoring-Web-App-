# Original match recovery dry run - no writes performed

## Evidence from supplied backups

| Evidence | Mobile | Desktop |
| --- | ---: | ---: |
| Workspace ID | `52832355-0bb1-451b-9d91-a7ced4ac2b24` | `6c782ae1-c23d-4723-bc50-646d77da7ccd` |
| Match ID | `790a460b-a998-489d-9401-52f94fb051fa` | same |
| Match revision/status | 331 / completed | 331 / completed |
| Innings | 2 | 2 |
| Events | 301 | 235 |
| Event sequence present | 1-301 | 1-235 |

All 235 shared events are structurally identical after omitting the device-local `workspaceId`.
There are no duplicate event IDs, duplicate `seq` values, or orphaned event-to-innings links in
either backup. Desktop lacks exactly event sequence 236-301: 54 deliveries, 9 bowler selections,
and 3 batter selections.

## Event replay

- Mobile: Royal club 145/10 (18.4), Chota latiyawala 146/6 (16.2); Chota latiyawala won by four
  wickets. Extras are 28 (21 wides, 3 no-balls, 4 leg-byes) and 17 (10 wides, 3 no-balls, 4
  leg-byes) respectively.
- Desktop: Royal club 145/10 (18.4), Chota latiyawala 72/3 (8.0), unfinished.

The mobile event history agrees with the supplied PDF scorecard. The desktop completed status is
not supported by its event history.

## Workspace finding

The two workspace IDs are expected to be different local Dexie container IDs. They do not identify
the cloud account and are deliberately stripped before account-scoped sync records are written.
They do not explain a missing contiguous suffix by themselves. The supplied backup format excludes
`syncMeta`, so it cannot prove whether both devices were mapped to `CRS-353209` at the time of the
failure. The direct cause visible in these backups is missing propagation of event records 236-301.

Desktop also contains one additional, unrelated local team named `Check`; the two match teams have
the same stable IDs on both devices. This team must not be merged or deleted during recovery.

## Proposed recovery - pending explicit approval

1. Run the read-only Atlas diagnostic for `CRS-353209` and the original match first.
2. If Atlas already has all 301 active events, do not import anything. Authenticate Desktop against
   the same account and perform normal pull/sync; verify replay becomes 146/6.
3. If Atlas has only 235 events, use Mobile as the only event source. Verify its active account
   mapping and export another backup. Queue only event IDs that Atlas lacks, preserving their
   original IDs, `seq`, `inningsId`, and event data. Do not queue match-summary replacement.
4. Upload those event records with the ordinary acknowledgement-based sync queue. Do not mark any
   operation complete until the server acknowledges it.
5. Pull on Desktop. The completion gate must retain `Sync incomplete` until all 301 event records
   are local and replay to both finished innings; it must then show 146/6 and the four-wicket
   result.
6. Compare event IDs and replays on both devices; then verify team performance/player statistics
   from the single original match only.

No records were changed while producing this dry run. The plan intentionally has no branch that
deletes/replaces the match, clears a queue, merges the `Check` team, changes player/team IDs, or
fabricates a delivery.
