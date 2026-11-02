import { teamStatistics } from './statistics.js';

// Crease Rating v1 is transparent product logic, not an ICC algorithm.
export const RATING_ENGINE_VERSION = 'crease-rating-v1';
export const rankingMetrics = {
  Batters: [
    ['runs', 'Most runs', 'desc'], ['average', 'Highest average', 'desc'],
    ['strikeRate', 'Highest strike rate', 'desc'], ['fours', 'Most fours', 'desc'],
    ['sixes', 'Most sixes', 'desc'], ['fifties', 'Most fifties', 'desc'],
    ['hundreds', 'Most hundreds', 'desc'], ['battingRating', 'Crease batting rating', 'desc'],
  ],
  Bowlers: [
    ['wickets', 'Most wickets', 'desc'], ['bowlingAverage', 'Best average', 'asc'],
    ['economy', 'Best economy', 'asc'], ['bowlingStrikeRate', 'Best strike rate', 'asc'],
    ['dots', 'Most dot balls', 'desc'], ['maidens', 'Most maidens', 'desc'],
    ['bestFigures', 'Best figures', 'desc'], ['bowlingRating', 'Crease bowling rating', 'desc'],
  ],
  'All-Rounders': [
    ['allRounderRating', 'Crease all-rounder rating', 'desc'],
    ['points', 'Legacy Crease points', 'desc'],
  ],
};
export const defaultQualification = { minBatInnings: 3, minBatBalls: 24, minBowlInnings: 3, minBowlBalls: 24 };

const bounded = (value) => Math.max(0, Math.min(1000, value));
const ratio = (a, b) => (b ? a / b : null);
const unique = (rows = []) => [...new Map(rows.map((row) => [row.id, row])).values()];
const rateMetrics = new Set(['average', 'strikeRate', 'bowlingAverage', 'economy', 'bowlingStrikeRate']);
const ratingMetrics = new Set(['battingRating', 'bowlingRating', 'allRounderRating']);
// Count rankings describe participation. Rates and ratings need a meaningful sample.
export const requiresQualification = (metric) => rateMetrics.has(metric) || ratingMetrics.has(metric);

function qualification(row, category, criteria) {
  const minimum = {
    ...defaultQualification,
    ...criteria,
    // Compatibility for older callers while the UI uses explicit batting/bowling names.
    minBatInnings: criteria.minBatInnings ?? criteria.minInnings ?? defaultQualification.minBatInnings,
    minBowlInnings: criteria.minBowlInnings ?? criteria.minInnings ?? defaultQualification.minBowlInnings,
  };
  const batting = row.innings >= minimum.minBatInnings && row.balls >= minimum.minBatBalls;
  const bowling = row.bowlingInnings >= minimum.minBowlInnings && row.legalBalls >= minimum.minBowlBalls;
  return {
    batting, bowling, allRounder: batting && bowling,
    battingProgress: `${Math.min(row.innings, minimum.minBatInnings)}/${minimum.minBatInnings} innings · ${Math.min(row.balls, minimum.minBatBalls)}/${minimum.minBatBalls} balls`,
    bowlingProgress: `${Math.min(row.bowlingInnings, minimum.minBowlInnings)}/${minimum.minBowlInnings} appearances · ${Math.min(row.legalBalls, minimum.minBowlBalls)}/${minimum.minBowlBalls} balls`,
    qualified: category === 'Batters' ? batting : category === 'Bowlers' ? bowling : batting && bowling,
  };
}

function rating(row) {
  // Exact weights and normalization targets are documented in CREASE_RANKING_SPEC.md.
  const overs = Math.max(1, row.averageOvers || 20);
  const expectedRuns = Math.max(12, overs * 3);
  const expectedEconomy = Math.max(3, Math.min(12, 6 + (20 - Math.min(20, overs)) * 0.1));
  const runContribution = bounded((row.runs / Math.max(1, row.innings * expectedRuns)) * 1000);
  const strikeRate = bounded(((row.strikeRate ?? 0) / 100) * 1000);
  const teamShare = bounded((row.runs / Math.max(1, row.teamRuns)) * 1000);
  const battingConfidence = Math.min(1, row.balls / defaultQualification.minBatBalls);
  const battingRating = (0.55 * runContribution + 0.25 * strikeRate + 0.2 * teamShare) * battingConfidence;
  const expectedWickets = Math.max(0.5, row.legalBalls / 36);
  const wicketContribution = bounded((row.wickets / expectedWickets) * 1000);
  const economyControl = row.economy === null ? 0 : bounded((expectedEconomy / row.economy) * 1000);
  const dotControl = bounded((row.dots / Math.max(1, row.legalBalls)) * 1000);
  const bowlingConfidence = Math.min(1, row.legalBalls / defaultQualification.minBowlBalls);
  const bowlingRating = (0.6 * wicketContribution + 0.3 * economyControl + 0.1 * dotControl) * bowlingConfidence;
  return { battingRating, bowlingRating, allRounderRating: (battingRating * bowlingRating) / 1000 };
}

export function playerTotals(data, { teamId = '', format = '', since = '', tournament = '' } = {}) {
  const matches = unique(data.matches).filter((match) =>
    !match.deletedAt && match.status === 'completed' && match.statisticsExcluded !== true &&
    (!format || String(match.rules?.overs) === String(format)) &&
    (!since || Date.parse(match.scheduledAt || match.date) >= Date.parse(since)) &&
    (!tournament || (match.tournamentId || match.tournament) === tournament),
  );
  const innings = unique(data.innings).filter((inning) => !inning.deletedAt);
  const events = unique(data.events).filter((event) => !event.deletedAt);
  const teams = [...new Set(matches.flatMap((match) => match.teams.map((team) => team.id)))].filter((id) => !teamId || id === teamId);
  const rows = new Map();
  const ensure = (player) => {
    if (!rows.has(player.id)) {
      const identity = data.players.find((candidate) => candidate.id === player.id);
      rows.set(player.id, { id: player.id, name: identity?.name || player.name, archived: !!identity?.archived,
        matches: 0, innings: 0, runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
        bowlingInnings: 0, legalBalls: 0, conceded: 0, wickets: 0, dots: 0, maidens: 0, bestWickets: 0, bestRuns: null,
        teamRuns: 0, scheduledOvers: 0, formatMatches: 0 });
    }
    return rows.get(player.id);
  };
  for (const id of teams) {
    const teamMatches = matches.filter((match) => match.teams.some((team) => team.id === id));
    const stats = teamStatistics(id, matches, innings, events);
    const scheduledOvers = teamMatches.reduce((total, match) => total + Number(match.rules?.overs || 0), 0);
    for (const player of stats.batting) {
      const row = ensure(player);
      for (const key of ['matches', 'innings', 'runs', 'balls', 'dismissals', 'fours', 'sixes', 'fifties', 'hundreds']) row[key] += player[key];
      row.teamRuns += stats.runs; row.scheduledOvers += scheduledOvers; row.formatMatches += teamMatches.length;
    }
    for (const player of stats.bowling) {
      const row = ensure(player);
      row.bowlingInnings += player.innings; row.legalBalls += player.balls; row.conceded += player.runs;
      for (const key of ['wickets', 'dots', 'maidens']) row[key] += player[key];
      row.scheduledOvers += scheduledOvers; row.formatMatches += teamMatches.length;
      if (player.bestRuns !== null && (player.bestWickets > row.bestWickets || (player.bestWickets === row.bestWickets && (row.bestRuns === null || player.bestRuns < row.bestRuns)))) {
        row.bestWickets = player.bestWickets; row.bestRuns = player.bestRuns;
      }
    }
  }
  return [...rows.values()].map((row) => {
    const calculated = { ...row, average: ratio(row.runs, row.dismissals), strikeRate: ratio(row.runs * 100, row.balls),
      bowlingAverage: ratio(row.conceded, row.wickets), economy: ratio(row.conceded * 6, row.legalBalls),
      bowlingStrikeRate: ratio(row.legalBalls, row.wickets), overs: `${Math.floor(row.legalBalls / 6)}.${row.legalBalls % 6}`,
      bestFigures: row.bestRuns === null ? null : `${row.bestWickets}/${row.bestRuns}`,
      points: row.runs + 20 * row.wickets, averageOvers: row.formatMatches ? row.scheduledOvers / row.formatMatches : 20 };
    return { ...calculated, ...rating(calculated) };
  });
}

function primaryCompare(left, right, metric, direction) {
  if (metric === 'bestFigures') return right.bestWickets - left.bestWickets || left.bestRuns - right.bestRuns;
  return (direction === 'asc' ? 1 : -1) * (left[metric] - right[metric]);
}
function tieBreak(left, right, metric) {
  if (metric === 'runs') return right.balls - left.balls || right.strikeRate - left.strikeRate;
  if (metric === 'wickets') return (left.bowlingAverage ?? Infinity) - (right.bowlingAverage ?? Infinity) || (left.economy ?? Infinity) - (right.economy ?? Infinity);
  return 0;
}

export function rankPlayers(rows, category, metric, criteria = {}, { provisional = false } = {}) {
  const direction = rankingMetrics[category].find((item) => item[0] === metric)?.[2] || 'desc';
  const qualifiedMetric = requiresQualification(metric);
  const ranked = rows.filter((row) => {
    const participates = category === 'Batters' ? row.innings > 0 : category === 'Bowlers' ? row.bowlingInnings > 0 : row.innings > 0 && row.bowlingInnings > 0;
    if (!participates || row[metric] === null || row[metric] === undefined) return false;
    const status = qualification(row, category, criteria);
    return provisional ? qualifiedMetric && !status.qualified : !qualifiedMetric || status.qualified;
  }).sort((left, right) => primaryCompare(left, right, metric, direction) || tieBreak(left, right, metric) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  let rank = 1;
  return ranked.slice(0, 20).map((row, index) => {
    if (index && primaryCompare(row, ranked[index - 1], metric, direction)) rank = index + 1;
    const status = qualification(row, category, criteria);
    return { ...row, ...status, rank, provisional: !status.qualified };
  });
}
