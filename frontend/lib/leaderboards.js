import { teamStatistics } from './statistics.js';
export const rankingMetrics = {
  Batters: [
    ['runs', 'Most runs', 'desc'],
    ['average', 'Highest average', 'desc'],
    ['strikeRate', 'Highest strike rate', 'desc'],
    ['fours', 'Most fours', 'desc'],
    ['sixes', 'Most sixes', 'desc'],
    ['fifties', 'Most fifties', 'desc'],
    ['hundreds', 'Most hundreds', 'desc'],
  ],
  Bowlers: [
    ['wickets', 'Most wickets', 'desc'],
    ['bowlingAverage', 'Best average', 'asc'],
    ['economy', 'Best economy', 'asc'],
    ['bowlingStrikeRate', 'Best strike rate', 'asc'],
    ['dots', 'Most dot balls', 'desc'],
    ['maidens', 'Most maidens', 'desc'],
    ['bestFigures', 'Best figures', 'desc'],
  ],
  'All-Rounders': [['points', 'Crease points', 'desc']],
};
const ratio = (a, b) => (b ? a / b : null);
const unique = (rows) => [...new Map(rows.map((r) => [r.id, r])).values()];
export function playerTotals(data, { teamId = '', format = '', since = '', tournament = '' } = {}) {
  const matches = unique(data.matches).filter(
    (m) =>
      !m.deletedAt &&
      m.status === 'completed' &&
      (!format || String(m.rules.overs) === String(format)) &&
      (!since || Date.parse(m.scheduledAt || m.date) >= Date.parse(since)) &&
      (!tournament || (m.tournamentId || m.tournament) === tournament),
  );
  const innings = unique(data.innings).filter((i) => !i.deletedAt),
    events = unique(data.events).filter((e) => !e.deletedAt);
  const teams = [...new Set(matches.flatMap((m) => m.teams.map((t) => t.id)))].filter(
    (id) => !teamId || id === teamId,
  );
  const rows = new Map();
  const ensure = (p) => {
    if (!rows.has(p.id))
      rows.set(p.id, {
        id: p.id,
        name: data.players.find((q) => q.id === p.id)?.name || p.name,
        archived: !!data.players.find((q) => q.id === p.id)?.archived,
        matches: 0,
        innings: 0,
        runs: 0,
        balls: 0,
        dismissals: 0,
        fours: 0,
        sixes: 0,
        fifties: 0,
        hundreds: 0,
        bowlingInnings: 0,
        legalBalls: 0,
        conceded: 0,
        wickets: 0,
        dots: 0,
        maidens: 0,
        bestWickets: 0,
        bestRuns: null,
      });
    return rows.get(p.id);
  };
  for (const id of teams) {
    const stats = teamStatistics(id, matches, innings, events);
    for (const p of stats.batting) {
      const r = ensure(p);
      for (const k of [
        'matches',
        'innings',
        'runs',
        'balls',
        'dismissals',
        'fours',
        'sixes',
        'fifties',
        'hundreds',
      ])
        r[k] += p[k];
    }
    for (const p of stats.bowling) {
      const r = ensure(p);
      r.bowlingInnings += p.innings;
      r.legalBalls += p.balls;
      r.conceded += p.runs;
      for (const k of ['wickets', 'dots', 'maidens']) r[k] += p[k];
      if (
        p.bestRuns !== null &&
        (p.bestWickets > r.bestWickets ||
          (p.bestWickets === r.bestWickets && (r.bestRuns === null || p.bestRuns < r.bestRuns)))
      ) {
        r.bestWickets = p.bestWickets;
        r.bestRuns = p.bestRuns;
      }
    }
  }
  return [...rows.values()].map((r) => ({
    ...r,
    average: ratio(r.runs, r.dismissals),
    strikeRate: ratio(r.runs * 100, r.balls),
    bowlingAverage: ratio(r.conceded, r.wickets),
    economy: ratio(r.conceded * 6, r.legalBalls),
    bowlingStrikeRate: ratio(r.legalBalls, r.wickets),
    overs: `${Math.floor(r.legalBalls / 6)}.${r.legalBalls % 6}`,
    bestFigures: r.bestRuns === null ? null : `${r.bestWickets}/${r.bestRuns}`,
    points: r.runs + 20 * r.wickets,
  }));
}
export function rankPlayers(
  rows,
  category,
  metric,
  { minInnings = 2, minBatBalls = 20, minBowlBalls = 12, minWickets = 2 } = {},
) {
  const direction = rankingMetrics[category].find((m) => m[0] === metric)?.[2] || 'desc';
  const rate = ['average', 'strikeRate', 'bowlingAverage', 'economy', 'bowlingStrikeRate'].includes(
    metric,
  );
  const eligible = rows.filter((r) => {
    if (
      (category === 'Batters' && !r.innings) ||
      (category === 'Bowlers' && !r.bowlingInnings) ||
      (category === 'All-Rounders' && (!r.innings || !r.bowlingInnings))
    )
      return false;
    if (r[metric] === null || r[metric] === undefined) return false;
    if (!rate) return true;
    return category === 'Batters'
      ? r.innings >= minInnings && r.balls >= minBatBalls
      : r.bowlingInnings >= minInnings &&
          r.legalBalls >= minBowlBalls &&
          (metric === 'economy' || r.wickets >= minWickets);
  });
  const compare = (a, b) =>
    metric === 'bestFigures'
      ? b.bestWickets - a.bestWickets || a.bestRuns - b.bestRuns
      : (direction === 'asc' ? 1 : -1) * (a[metric] - b[metric]);
  eligible.sort(
    (a, b) => compare(a, b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  let rank = 1;
  return eligible.slice(0, 20).map((r, i) => {
    if (i && compare(r, eligible[i - 1])) rank = i + 1;
    return { ...r, rank };
  });
}
