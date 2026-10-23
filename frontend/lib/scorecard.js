import { overs, rate, result } from './engine.js';

const extrasLabel = (extras) =>
  `Wd ${extras.wide} · Nb ${extras.noBall} · B ${extras.bye} · Lb ${extras.legBye}`;

function inningsDetails(state, match, index) {
  const battingSide = index === 0 ? match.firstBat : 1 - match.firstBat;
  const battingTeam = match.teams[battingSide];
  const bowlingTeam = match.teams[1 - battingSide];
  const batters = Object.values(state.batting)
    .filter((player) => player.played)
    .map((player) => ({
      name: player.name,
      dismissal: player.out ? player.dismissal || 'Out' : 'Not out',
      runs: player.runs,
      balls: player.balls,
      fours: player.fours,
      sixes: player.sixes,
      strikeRate: rate(player.runs, player.balls, 100),
    }));
  const bowlers = Object.values(state.bowling)
    .filter((player) => player.bowled)
    .map((player) => ({
      name: player.name,
      overs: overs(player.balls),
      maidens: player.maidens,
      runs: player.runs,
      wickets: player.wickets,
      economy: rate(player.runs, player.balls, 6),
    }));

  return {
    team: battingTeam.name,
    opponent: bowlingTeam.name,
    score: `${state.runs}/${state.wickets}`,
    overs: overs(state.balls),
    runRate: rate(state.runs, state.balls, 6),
    runs: state.runs,
    wickets: state.wickets,
    batters,
    bowlers,
    extras: {
      total: Object.values(state.extras).reduce((total, value) => total + value, 0),
      ...state.extras,
      label: extrasLabel(state.extras),
    },
    falls: state.falls.map((fall) => ({
      wicket: fall.wickets,
      score: `${fall.runs}/${fall.wickets}`,
      batter: state.batting[fall.player]?.name ?? 'Batter',
      overs: overs(fall.balls),
    })),
  };
}

export function buildScorecard(match, states) {
  if (match.status !== 'completed' || states.length !== 2 || !states[1].done) {
    throw new Error('A scorecard is available after both innings are finalized.');
  }

  const innings = states.map((state, index) => inningsDetails(state, match, index));
  const tossWinnerIndex = Number(match.toss);
  const tossWinner = Number.isInteger(tossWinnerIndex) ? match.teams[tossWinnerIndex]?.name : null;
  const playersById = new Map(
    states
      .flatMap((state) => [...Object.values(state.batting), ...Object.values(state.bowling)])
      .map((player) => [player.id, player.name]),
  );
  const playerOfTheMatch = playersById.get(match.playerOfTheMatch) ?? '';

  return {
    title: `${match.teams[0].name} vs ${match.teams[1].name}`,
    result: result(match, states),
    date: match.date,
    venue: match.venue || '',
    oversPerSide: match.rules.overs,
    playersPerSide: match.rules.size,
    format: `${match.rules.overs} overs · ${match.rules.size} a side`,
    toss: tossWinner
      ? `${tossWinner} won the toss and elected to ${match.decision === 'bowl' ? 'bowl' : 'bat'}`
      : 'Toss details not recorded',
    playerOfTheMatch,
    innings,
  };
}

export function scorecardFilename(match) {
  const safe = (value) =>
    String(value)
      .normalize('NFKD')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Team';
  const parsed = new Date(`${match.date}T00:00:00`);
  const date = Number.isNaN(parsed.valueOf())
    ? 'date'
    : `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
  return `Crease_${safe(match.teams[0].name)}_vs_${safe(match.teams[1].name)}_${date}.pdf`;
}
