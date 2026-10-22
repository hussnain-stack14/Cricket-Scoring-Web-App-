# Implemented rule contract

Two innings, six legal balls per over, 1–50 overs and a configured maximum of 2–11 players per side. Matches may start with empty or partial squads; players are added to the match roster before they bat or bowl. All out is configured player limit minus one; no last-batter-alone mode. Ties stand. Rules and team identities are frozen at creation; match roster entries are appended as players are selected during play.

Wides and no-balls cost one penalty run and do not count as legal balls. No-balls count as a ball faced; wides do not. Bat runs, wides, no-balls, byes and leg-byes are separate. Byes/leg-byes are not charged to the bowler. Running is explicitly recorded separately from penalties/boundaries. Boundaries do not swap ends. Caught batters are replaced at their original end, regardless of crossing. At over completion, ends swap.

Supported dismissals: bowled, caught, LBW, stumped, hit wicket, run out. Only run out is supported on no-balls/free hits; on wides, run out, stumped and hit wicket. Optional ICC-style free hit after every no-ball persists through illegal deliveries. Run outs identify the dismissed batter and the surviving batter's end explicitly. Bowler wickets exclude run outs. Winning extras end the chase before a subsequent wicket. Bowler changes are mandatory after overs; consecutive overs and the configured maximum are enforced.

The team bowling leaderboard counts a dot ball when no runs are charged to the bowler on a delivery; byes and leg-byes therefore count as dots, while wides and no-balls do not. Bowling rates use legal balls, and overs are shown in six-ball cricket notation.

Undo reverses the latest delivery and any dependent selections. Historical correction deliberately truncates the corrected delivery and everything after it (including the chase), with an explicit preview and audit snapshot; the scorer re-enters reviewed play. This conservative review flow avoids inventing subsequent selections. Finalization requires a completed second innings and contributes once to derived career statistics. Reopening removes that contribution.

Unsupported: retired hurt/out, timed out, obstructing the field, hit ball twice, penalty runs beyond wide/no-ball, short runs, runners, dead-ball incidents, overthrow boundary allowances, declaration, forfeits, DLS, super overs and mid-over injured-bowler substitutions. Record only supported umpire decisions; do not approximate these variations.

Sources consulted before implementation: [MCC no-ball law](https://www.lords.org/mcc/the-laws-of-cricket/no-ball), [MCC scoring runs](https://www.lords.org/MCC/The-Laws-of-Cricket/Scoring-runs), [MCC laws and playing conditions/free hits](https://lawsofcricket.lords.org/laws-and-playing-conditions), [ICC all-no-ball free hits](https://www.icc-cricket.com/news/new-playing-conditions-come-into-effect). This is a documented recreational limited-overs subset, not automated umpiring or complete ICC playing conditions.
