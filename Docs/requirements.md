Crease — Initial Requirements
Status: Draft for review. These requirements describe planned behavior.
Problem and goal
Local cricket teams need a consistent way to record deliveries, produce
scorecards, and maintain player histories. Crease will let an assigned scorer
record a match on a phone while players and viewers inspect scores and statistics.
The first release should prioritize scoring accuracy and correction of mistakes.
Users and permissions
Role	Responsibilities
Organizer	Manage teams, players, match setup, and scorer assignments; reopen finalized matches
Scorer	Record and correct deliveries in assigned, editable matches; finalize results
Viewer	Read permitted match scorecards and player statistics


The backend must enforce permissions. Hiding a button is not authorization.
Only one scoring device may actively edit a match at a time in the initial release.
Five essential features
1. Create teams and player profiles with unique IDs; select match squads.
2. Create limited-overs matches with venue, squads, toss, and rule settings.
3. Record and correct deliveries, including runs, extras, and dismissals.
4. Display scorecards, over summaries, delivery history, and match results.
5. Search players and calculate career statistics from finalized matches.
Match workflow
Create teams and players → select squads → configure match → record toss →
select opening batters and bowler → score first innings → finish innings →
set chase target → score second innings → determine result → finalize match →
update career statistics.

At the end of an over, choose the next bowler. After a dismissal, request the
replacement batter when play can continue. Stop ordinary scoring once an innings
ends. Support corrections through a deliberate edit action.
Functional requirements
Teams and players
- Store player name, unique ID, and role.
- Allow identical names; distinguish players by ID and team.
- Validate squad membership and avoid duplicate selections.
- Retain historical player references when current team membership changes.
Match setup
- Record teams, date, venue, overs, playing squads, toss winner, and decision.
- Validate that opposing teams differ and required selections are complete.
- Save the chosen rules with the match so later setting changes do not alter history.
Scoring
- Store individual delivery events as the source for match calculations.
- Record striker, non-striker, bowler, bat runs, extras by type, and dismissal details.
- Distinguish event order from legal-ball numbering: wides and no-balls create
  events without consuming a legal delivery.
- Track balls faced separately from legal balls bowled according to adopted rules.
- Calculate team totals, individual performances, overs, partnerships, and chase figures.
- Determine strike changes using completed runs and applicable end-of-over and
  dismissal rules; do not simply use total runs including penalties.
- Do not credit run-outs or other non-bowler dismissals to the bowler.
- Provide undo and historical correction with an audit trail.
- Recalculate affected later state after a correction; request review if subsequent
  batter, bowler, or innings selections become inconsistent.
Scorecards and statistics
- Show batting and bowling tables, extras, fall of wickets, and innings totals.
- Allow viewers to expand an over into its recorded delivery events.
- Search player profiles by name, with team information for disambiguation.
- Show previous performances and career batting and bowling totals.
- Include finalized matches in career statistics by default.
- Reopening a finalized match removes its contribution until it is finalized again.
- Corrections and repeated synchronization must never count a match twice.
Statistics definitions
- Batting average = total runs / dismissals.
- Batting strike rate = total runs / balls faced × 100.
- Bowling average = runs conceded / wickets credited to the bowler.
- Bowling strike rate = legal balls bowled / wickets credited to the bowler.
- Economy = runs conceded × 6 / legal balls bowled, assuming six-ball overs.
- Runs per innings is a separate metric and must not be labeled batting average.
- Display “—” when the denominator is zero; round display values to two decimals.
- Aggregate raw totals before calculating career rates.
- Represent overs as completed overs plus remaining legal balls, not a decimal.
  For example, 15 legal balls displays as 2.3 overs.
- Keep team extras separate from runs charged to a bowler; byes and leg-byes
  must not be charged as bowler runs under the proposed standard rules.
Installation, offline use, and usability
- Provide an installable PWA on supported platforms.
- Plan local delivery storage and synchronization before implementing scoring.
- Offline scoring requires previously loaded match data and reliable local storage.
- Clearly distinguish saved on device, sync pending, synced, and sync failed.
- Use unique event identifiers and ordering to prevent duplicate deliveries on retries.
- Block conflicting edits from another device; never silently overwrite a match.
- Validate offline recovery and synchronization before real-match use.
- Design for 320–430 px mobile widths with readable text and 44 px minimum touch targets.
- Keep scoring controls easy to reach and avoid relying on color alone.
Initial assumptions — pending confirmation
- One innings per team; limited-overs format.
- Six legal deliveries per over.
- Default wide and no-ball penalty of one run, with additional runs recorded separately.
- Standard two-batter play; no last-batter-alone mode initially.
- No rain-adjusted targets or multi-innings matches in the first version.
- One active scoring device per match.
These are proposed defaults, not confirmed local competition rules.
Unresolved rules
- Standard cricket, tennis-ball, or tape-ball rules?
- Allowed squad sizes and the corresponding all-out condition?
- Wide and no-ball penalties, additional extras, and free-hit behavior?
- Which dismissals are supported, including LBW, retired hurt, and retired out?
- Any last-batter-alone rule?
- Overs per innings and maximum overs per bowler?
- Tie handling: tied result or a later super-over feature?
- Who may finalize, reopen, and correct completed matches in the local workflow?
Acceptance criteria
1. Wide: Given a one-run wide rule, recording a wide with no additional runs
   adds one team extra and one bowler run, but no legal ball or batter run.
2. Boundary: Recording a normal legal four adds four team and batter runs,
   one ball faced, one legal ball, and one four to the batter's boundary count.
3. Undo: Undoing the latest delivery restores the prior score, legal-ball count,
   batter and bowler figures, and strike state, while retaining an audit record.
4. Player search: Searching a name returns matching profiles with team and ID;
   selecting a result opens the correct player's history. No match shows an empty state.
5. Batting average: Scores of 20 and 60 with two dismissals produce 40.00;
   with one dismissal they produce 80.00. No dismissals displays “—”.
6. Career strike rate: 80 runs from 55 balls produces 145.45 using aggregate totals.
7. Over notation: Fifteen legal deliveries display as 2.3 overs; a wide does
   not advance that count.
8. Permissions: A viewer's attempt to submit or edit a delivery is rejected
   by the backend, even if the request bypasses the UI.
9. Sync retry: Sending the same saved delivery twice results in one recorded event.
10. Finalization: Finalizing the same match twice does not duplicate player totals.
Out of scope initially
Payments, subscriptions, live video, tournament scheduling, advanced analytics,
automated umpiring, and simultaneous scoring from multiple devices.
Review status
Requirements drafted. Cricket rules, live-scoring wireframe, and technical
implementation remain subject to review. No working functionality is claimed.
