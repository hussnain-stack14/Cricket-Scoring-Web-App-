# Crease ranking specification — Rating v1

This is a transparent Crease product rating. It is not, and does not claim to be, an ICC rating.
All values are derived at read time from completed, non-deleted, non-excluded match event histories.

## Traditional rankings

- Batting average = runs ÷ dismissals. A player with no dismissal has an undefined average (`—`).
- Strike rate = runs ÷ balls faced × 100.
- Bowling average = runs conceded ÷ wickets. A wicketless bowler has an undefined average.
- Economy = runs conceded × 6 ÷ legal balls. Wides and no-balls are not legal balls; byes and leg-byes follow the scoring engine’s conceded-runs attribution; run-outs do not award a bowler wicket.
- Bowling strike rate = legal balls ÷ wickets.

Most Runs and Most Wickets include every player with completed-match participation. Rate and rating tables separate qualified players from provisional players. The default qualification is 3 batting innings and 24 balls faced, or 3 bowling appearances and 24 legal balls. All-rounders must meet both requirements.

Rows use deterministic ordered comparators and unique sequential positions: `1, 2, 3`. A stable player ID is the final tie-breaker, so two players never share a displayed rank.

- **Batting Performance** (the default batter view): runs descending, then batting average descending when both averages are defined, then strike rate descending, then stable player ID. When one or both batters are not out, average is not comparable and strike rate is used next.
- **Bowling Performance** (the default bowler view): wickets descending, then bowling average ascending, then economy ascending, then stable player ID. A wicketless bowler has an undefined bowling average and is therefore ordered after a bowler with the same wickets and a defined average; wicketless bowlers are then ordered by economy. A bowler with no legal balls is below one with a valid economy.
- Standalone metrics use that selected metric first and the corresponding performance comparator as their documented tie-breaker.

## Crease Rating v1

Every component is bounded to 0–1000 before weighting. A confidence multiplier is `min(1, balls / 24)` for batting and `min(1, legal balls / 24)` for bowling. This reduces small-sample inflation without hiding provisional players.

Batting rating:

`confidence × (0.55 × run contribution + 0.25 × strike-rate performance + 0.20 × share of team runs)`

- Run contribution = `min(1000, runs ÷ (batting innings × max(12, scheduled overs × 3)) × 1000)`.
- Strike-rate performance = `min(1000, strike rate ÷ 100 × 1000)`.
- Team-run share = `min(1000, player runs ÷ team runs × 1000)`.

Bowling rating:

`confidence × (0.60 × wicket contribution + 0.30 × economy control + 0.10 × dot-ball control)`

- Wicket contribution compares wickets with `max(0.5, legal balls ÷ 36)` expected wickets.
- Economy control = `min(1000, expected economy ÷ actual economy × 1000)`, with expected economy bounded from 3 to 12 by format length.
- Dot-ball control = `min(1000, dots ÷ legal balls × 1000)`.

All-rounder rating is `batting rating × bowling rating ÷ 1000`. Legacy `runs + 20 × wickets` remains selectable only as **Legacy Crease Points**.

## Validation examples

- A 30-run not-out has an undefined batting average, so it is never ranked as the highest average solely for being not out.
- A 0-wicket bowler has an undefined bowling average and strike rate, but can appear in Most Dot Balls and provisional economy views.
- A bowler conceding 7 from 5 legal balls has economy `8.40`; partial overs are never treated as decimal overs.
- Rating comparisons use full precision. Display rounding never changes order or shared ranks.
