import { matchStates } from './engine.js';

const emptyBatting = (player) => ({
  id: player.id,
  name: player.name,
  matches: 0,
  innings: 0,
  runs: 0,
  balls: 0,
  highest: null,
  dismissals: 0,
  notOuts: 0,
  fours: 0,
  sixes: 0,
  thirties: 0,
  fifties: 0,
  hundreds: 0,
});

const emptyBowling = (player) => ({
  id: player.id,
  name: player.name,
  matches: 0,
  innings: 0,
  balls: 0,
  runs: 0,
  wickets: 0,
  dots: 0,
  maidens: 0,
  bestWickets: 0,
  bestRuns: null,
});

function divide(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function withRates(player) {
  return {
    ...player,
    average: divide(player.runs, player.dismissals),
    strikeRate: divide(player.runs * 100, player.balls),
    economy: divide(player.runs * 6, player.balls),
    bowlingAverage: divide(player.runs, player.wickets),
    bowlingStrikeRate: divide(player.balls, player.wickets),
    overs: `${Math.floor(player.balls / 6)}.${player.balls % 6}`,
    bestFigures: player.bestRuns === null ? null : `${player.bestWickets}/${player.bestRuns}`,
  };
}

function ensure(map, player, factory) {
  if (!map.has(player.id)) map.set(player.id, factory(player));
  return map.get(player.id);
}

export function teamStatistics(teamId, matches, innings, events) {
  const batting = new Map();
  const bowling = new Map();
  const summary = {
    matches: 0,
    won: 0,
    lost: 0,
    tied: 0,
    noResults: 0,
    runs: 0,
    wickets: 0,
    highest: null,
    lowest: null,
    incompleteCompleted: 0,
  };

  for (const match of matches) {
    if (match.status !== 'completed') continue;
    const teamIndex = match.teams.findIndex((team) => team.id === teamId);
    if (teamIndex === -1) continue;
    const matchInnings = innings.filter((inning) => inning.matchId === match.id);
    const matchEvents = events.filter((event) => event.matchId === match.id);
    const states = matchStates(match, matchInnings, matchEvents);
    if (states.length !== 2 || !states[0].done || !states[1].done) {
      summary.incompleteCompleted++;
      continue;
    }

    summary.matches++;
    const firstRuns = states[0].runs;
    const secondRuns = states[1].runs;
    const firstBatTeam = match.teams[match.firstBat].id;
    const teamBattedFirst = firstBatTeam === teamId;
    const teamRuns = teamBattedFirst ? firstRuns : secondRuns;
    const opponentRuns = teamBattedFirst ? secondRuns : firstRuns;
    if (teamRuns === opponentRuns) summary.tied++;
    else if (teamRuns > opponentRuns) summary.won++;
    else summary.lost++;

    for (const [index, state] of states.entries()) {
      const battingIndex = index === 0 ? match.firstBat : 1 - match.firstBat;
      const battingTeam = match.teams[battingIndex];
      const fieldingTeam = match.teams[1 - battingIndex];
      if (battingTeam.id === teamId) {
        summary.runs += state.runs;
        if (state.done) {
          summary.highest = Math.max(summary.highest ?? 0, state.runs);
          summary.lowest = Math.min(summary.lowest ?? state.runs, state.runs);
        }
        for (const player of battingTeam.squad) {
          const playerStats = ensure(batting, player, emptyBatting);
          playerStats.matches++;
          const score = state.batting[player.id];
          if (!score?.played) continue;
          playerStats.innings++;
          playerStats.runs += score.runs;
          playerStats.balls += score.balls;
          playerStats.highest = Math.max(playerStats.highest ?? 0, score.runs);
          playerStats.dismissals += Number(score.out);
          playerStats.notOuts += Number(!score.out);
          playerStats.fours += score.fours;
          playerStats.sixes += score.sixes;
          playerStats.thirties += Number(score.runs >= 30 && score.runs < 50);
          playerStats.fifties += Number(score.runs >= 50 && score.runs < 100);
          playerStats.hundreds += Number(score.runs >= 100);
        }
      } else {
        summary.wickets += state.wickets;
        for (const player of fieldingTeam.squad) {
          const playerStats = ensure(bowling, player, emptyBowling);
          playerStats.matches++;
          const figures = state.bowling[player.id];
          if (!figures?.bowled) continue;
          playerStats.innings++;
          playerStats.balls += figures.balls;
          playerStats.runs += figures.runs;
          playerStats.wickets += figures.wickets;
          playerStats.dots += figures.dots;
          playerStats.maidens += figures.maidens;
          if (
            figures.wickets > playerStats.bestWickets ||
            (figures.wickets === playerStats.bestWickets &&
              (playerStats.bestRuns === null || figures.runs < playerStats.bestRuns))
          ) {
            playerStats.bestWickets = figures.wickets;
            playerStats.bestRuns = figures.runs;
          }
        }
      }
    }
  }

  const battingRows = [...batting.values()].map(withRates);
  const bowlingRows = [...bowling.values()].map(withRates);
  for (const player of battingRows) {
    player.performanceScore =
      player.average === null || player.strikeRate === null
        ? null
        : (player.average * player.strikeRate) / 100;
    player.qualified = player.innings >= 2 && player.balls >= 20;
  }
  for (const player of bowlingRows) {
    player.dotRate = divide(player.dots * 100, player.balls);
    player.performanceScore =
      player.wickets < 1 || player.economy === null || player.dotRate === null
        ? null
        : player.wickets * 3 +
          player.dotRate / 10 -
          player.economy -
          (player.bowlingAverage ?? 0) / 10;
    player.qualified = player.innings >= 2 && player.balls >= 12 && player.wickets >= 2;
  }

  return {
    ...summary,
    winPercentage: summary.matches ? (summary.won / summary.matches) * 100 : null,
    batting: battingRows,
    bowling: bowlingRows,
  };
}

export function sortStatistics(rows, criterion, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[criterion];
    const right = b[criterion];
    if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'string' && typeof right === 'string')
      return sign * left.localeCompare(right);
    return sign * (left - right);
  });
}

export function compareStatistic(a, b, criterion, lowerIsBetter = false) {
  if (a === null || a === undefined || b === null || b === undefined || a === b) return null;
  return lowerIsBetter ? (a < b ? 'a' : 'b') : a > b ? 'a' : 'b';
}
