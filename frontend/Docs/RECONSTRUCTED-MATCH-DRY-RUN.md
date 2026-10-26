# Reconstructed match dry-run - no writes performed

Date reviewed: 26 October 2026. Target account: `CRS-353209`. The original match ID
`790a460b-a998-489d-9401-52f94fb051fa` is excluded from this work and must not be changed.

## Source arithmetic validation

| Innings | CSV rows | Legal balls | Overs | Runs | Wickets | Bat runs | Wides | No-balls | Leg-byes | Extras |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Royal club | 136 | 112 | 18.4 | 145 | 10 | 117 | 21 | 3 | 4 | 28 |
| Chota latiyawala | 111 | 98 | 16.2 | 146 | 6 | 129 | 10 | 3 | 4 | 17 |

Every CSV score delta and wicket total matches the preceding row. Repeated `Over.Ball` labels are
expected for 21/3 and 10/3 illegal wide/no-ball deliveries; they are not duplicate legal balls.
The derived totals agree with the supplied PDF scorecard.

### Fall-of-wicket checkpoints

- Royal club: 18/1, 28/2, 66/3, 67/4, 76/5, 82/6, 87/7, 138/8, 142/9, 145/10.
- Chota latiyawala: 50/1, 72/2, 72/3, 80/4, 106/5, 111/6.

These checkpoints agree with the PDF. The reconstructed outcome is therefore supported at an
innings-total level: Chota latiyawala 146/6 at 16.2, winning by four wickets.

## Import decision: blocked

The CSV is **not sufficient for an accurate Crease event import**. Crease's replay engine requires
each legal delivery to have the current striker, non-striker, bowler, selected replacement batters,
and a legal wicket object. The CSV only records aggregate delivery outcome and a dismissed name.

Missing or ambiguous facts:

1. No stable Crease team/player IDs or verified roster mapping.
2. No opening batter/non-striker/bowler selections and no bowler for each delivery/over.
3. No striker-end information for run-outs or new-batter-end information after wickets.
4. Wickets are encoded as `0 + W (name)` without dismissal kind. The PDF helps classify several
   dismissals but does not supply every required replay transition.
5. The PDF shows two players named Bakar in the chase. Name matching would be unsafe and is
   prohibited; their distinct stable IDs must be selected explicitly.
6. No confirmed `maxBowler` rule for the 20-over match. Crease validates this while replaying.

Creating a completed summary record from the totals would violate the event-canonical sync model.
No match, innings, event, IndexedDB, pending queue, MongoDB, or sync record was created or changed.

## Requirements before a reviewed import can be proposed

1. Read-only account diagnostics or a safe authenticated export to identify the exact existing
   Royal club, Chota latiyawala, and player IDs.
2. An explicit roster mapping that disambiguates duplicate names, especially both Bakars.
3. Per-over bowler assignment and the opening XI/striker/non-striker for both innings.
4. Dismissal kind, dismissed player ID, and survivor/new-batter end for each wicket.
5. Confirmed match rules, including maximum overs per bowler and free-hit setting.
6. A second dry run that converts the supplied source into fresh UUIDs, replays it through the
   existing engine, and verifies scorecard totals before any authorized local import.

Only after those items are supplied should an import plan be presented for explicit approval. The
approved workflow must create a new match and fresh innings/events locally, leave it pending until
server acknowledgement, verify the complete event history on the cloud, and then allow both
devices to pull the new completed scorecard.
