# Crease — Cricket Scoring App

Crease is a mobile-first cricket scoring web app for local teams.
It will record matches ball by ball and calculate player statistics
from completed match records.

> Status: Planning and requirements. Features below are planned,
> not implemented yet.

## Project Goals

- Make scoring local cricket matches simple.
- Maintain accurate batting and bowling records.
- Give players access to their previous performances.
- Support installation as a Progressive Web App (PWA).

## Planned Features

### Teams and Players
- Create teams and player profiles.
- Assign player roles and select match squads.
- Identify players using unique IDs.

### Match Setup
- Select teams, squads, venue, and overs.
- Record the toss and batting decision.
- Select opening batters and the opening bowler.

### Ball-by-Ball Scoring
- Record dot balls, runs, boundaries, and wickets.
- Record wides, no-balls, byes, and leg-byes.
- Track legal deliveries and over completion.
- Update batter, bowler, and team totals.
- Undo or correct scoring mistakes.

### Scorecards and Match History
- View batting and bowling scorecards.
- Review deliveries and over summaries.
- Record results and finalize matches.

### Player Statistics
- Search players by name and team.
- View previous match performances.
- Calculate batting average and strike rate.
- Calculate bowling average, economy, and strike rate.

### Installation and Offline Support
- Install the app on supported devices.
- Save scoring data locally during connection loss.
- Sync saved data when connectivity returns.

Offline scoring and synchronization require implementation
and testing before use in real matches.

## User Roles

| Role | Planned permissions |
| --- | --- |
| Organizer | Manage teams, players, matches, and scorer access |
| Scorer | Score assigned matches and correct permitted records |
| Viewer | View scores, scorecards, and player statistics |

## Proposed Tech Stack

- Frontend: React, JavaScript, Tailwind CSS
- Backend: Node.js, Express.js
- Database: MongoDB
- Version control: Git and GitHub
- Installation: Progressive Web App features

Frontend tooling and deployment services are not finalized.

## Main Workflow

1. Create teams and players.
2. Select the playing squads.
3. Configure the match and record the toss.
4. Select opening batters and bowler.
5. Record each delivery.
6. Complete the first innings.
7. Score the chase.
8. Finalize the result.
9. Update player statistics from finalized match records.

## Statistics Rules

- Batting average = total runs / dismissals.
- Batting strike rate = total runs / balls faced × 100.
- Bowling average = runs conceded / wickets credited.
- Bowling strike rate = legal balls bowled / wickets credited.
- Economy rate = runs conceded / (legal balls bowled / 6).

The economy formula assumes six legal deliveries per over.
Over notation is not a decimal: 2.3 overs means 15 legal balls.

Display "—" when a statistic has a zero denominator.
Calculate career statistics from combined totals, not by
averaging individual match averages or strike rates.

## Initial Scope

The first version targets limited-overs matches with one
innings per team and one active scoring device per match.

Payments, tournament management, live streaming, and
advanced analytics are outside the initial scope.

## Rules to Confirm

- Standard cricket rules or local tape-ball rules.
- Wide and no-ball penalties.
- Free-hit rules.
- Supported dismissal types.
- Last-batter rules.
- Overs and bowler limits.
- Tie handling.

## Repository Structure

Current:

- README.md
- .gitignore
- docs/requirements.md
- docs/day-01.md

Planned application folders:

- frontend/
- backend/

## Local Setup

Application setup is pending.

Installation commands, environment variables, and development
scripts will be documented when the application is initialized.

## Development Practices

- Write simple, readable JavaScript.
- Validate incoming data on the backend.
- Enforce permissions on the server.
- Keep secrets out of version control.
- Store deliveries as the source for match calculations.
- Verify scoring rules and corrections with meaningful tests.
- Use clear commit messages and review changes before merging.

## Author

Hussnain Ali

Built as a portfolio project through a three-month,
self-directed internship simulation.
