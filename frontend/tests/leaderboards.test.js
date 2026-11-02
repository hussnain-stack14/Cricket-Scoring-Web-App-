import test from 'node:test';
import assert from 'node:assert/strict';
import { playerTotals, rankPlayers } from '../lib/leaderboards.js';
const side = (id, names) => ({
  id,
  name: id,
  squad: names.map((name) => ({ id: name, name })),
});

function completedMatch(id, teams, firstBat, firstEvents, secondEvents) {
  const match = {
    id,
    status: 'completed',
    firstBat,
    rules: { overs: 1, size: 2, maxBowler: 1, freeHit: true },
    teams,
  };
  const innings = [
    {
      id: `${id}-1`,
      matchId: id,
      number: 1,
      striker: teams[firstBat].squad[0].id,
      nonStriker: teams[firstBat].squad[1].id,
      bowler: teams[1 - firstBat].squad[0].id,
    },
    {
      id: `${id}-2`,
      matchId: id,
      number: 2,
      striker: teams[1 - firstBat].squad[0].id,
      nonStriker: teams[1 - firstBat].squad[1].id,
      bowler: teams[firstBat].squad[0].id,
    },
  ];
  const deliveries = (eventsByInnings) =>
    eventsByInnings.flatMap((list, index) =>
      list.map((event, seq) => ({
        id: `${id}-${index}-${seq}`,
        workspaceId: 'workspace',
        matchId: id,
        inningsId: innings[index].id,
        seq: seq + 1,
        type: 'delivery',
        bat: 0,
        extra: 'none',
        extraRuns: 0,
        running: 0,
        ...event,
      })),
    );
  return {
    match,
    innings,
    events: deliveries([firstEvents, secondEvents]),
  };
}

test('leaderboards use unique completed match snapshots, retain archived identities, and calculate raw denominators', () => {
  const teams = [side('A', ['a1', 'a2']), side('B', ['b1', 'b2'])];
  const one = completedMatch(
    'one',
    teams,
    0,
    [
      { extra: 'wide', extraRuns: 0 },
      ...Array.from({ length: 5 }, () => ({ bat: 1, running: 0 })),
      { wicket: { kind: 'bowled', player: 'a1' } },
    ],
    [{ wicket: { kind: 'bowled', player: 'b1' } }],
  );
  one.match.date = '2026-10-24';
  const data = {
    players: [{ id: 'a1', name: 'Archived scorer', archived: true }],
    matches: [one.match, one.match, { ...one.match, id: 'live', status: 'live' }],
    innings: [...one.innings, ...one.innings],
    events: [...one.events, ...one.events],
  };
  const totals = playerTotals(data),
    a = totals.find((p) => p.id === 'a1'),
    b = totals.find((p) => p.id === 'b1');
  assert.equal(a.matches, 1);
  assert.equal(a.runs, 5);
  assert.equal(a.average, 5);
  assert.equal(a.strikeRate, 500 / 6);
  assert.equal(a.archived, true);
  assert.equal(a.name, 'Archived scorer');
  assert.equal(b.legalBalls, 6);
  assert.equal(b.conceded, 6);
  assert.equal(b.economy, 6);
  assert.equal(b.bowlingStrikeRate, 6);
  assert.equal(a.points, 25);
  assert.deepEqual(
    playerTotals(data, { teamId: 'A' })
      .map((p) => p.id)
      .sort(),
    ['a1', 'a2'],
  );
  assert.equal(playerTotals(data, { since: '2027-01-01' }).length, 0);
  assert.equal(playerTotals(data, { format: '20' }).length, 0);
  assert.equal(
    playerTotals({ ...data, matches: [{ ...one.match, deletedAt: 'today' }] }).length,
    0,
  );
  assert.equal(playerTotals({ ...data, matches: [{ ...one.match, status: 'live' }] }).length, 0);
  assert.equal(
    playerTotals({ ...data, matches: [{ ...one.match, statisticsExcluded: true }] }).length,
    0,
  );
});
test('top 20 caps output, preserves deterministic competition ties, and sorts lower-is-better rates correctly', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: String(i).padStart(2, '0'),
    name: 'Player ' + String(i).padStart(2, '0'),
    innings: 2,
    bowlingInnings: 2,
    balls: 30,
    legalBalls: 18,
    wickets: 3,
    runs: 100 - i,
    average: 50 - i,
    strikeRate: 100 - i,
    economy: i + 1,
    bowlingAverage: i + 2,
    bowlingStrikeRate: i + 3,
    bestWickets: i % 4,
    bestRuns: 25 - i,
    bestFigures: `${i % 4}/${25-i}`,
    points: 160 - i,
  }));
  assert.equal(rankPlayers(rows, 'Batters', 'runs').length, 20);
  const twoAppearanceThreshold = { minBowlInnings: 2, minBowlBalls: 12 };
  assert.equal(rankPlayers(rows, 'Bowlers', 'economy', twoAppearanceThreshold)[0].id, '00');
  assert.equal(rankPlayers(rows, 'Bowlers', 'bowlingAverage', twoAppearanceThreshold)[0].id, '00');
  assert.equal(rankPlayers(rows, 'Bowlers', 'bowlingStrikeRate', twoAppearanceThreshold)[0].id, '00');
  assert.equal(rankPlayers(rows, 'Bowlers', 'bestFigures')[0].id, '23');
  const tied = rankPlayers(
    [{ ...rows[0], runs: 100 }, { ...rows[1], runs: 100 }, rows[2]],
    'Batters',
    'runs',
  );
  assert.deepEqual(
    tied.map((p) => p.rank),
    [1, 1, 3],
  );
  assert.equal(rankPlayers(rows, 'Batters', 'average', { minInnings: 3 }).length, 0);
  assert.equal(
    rankPlayers([{ ...rows[0], average: null }], 'Batters', 'average', {
      minInnings: 0,
      minBatBalls: 0,
    }).length,
    0,
  );
  assert.equal(
    rankPlayers([{ ...rows[0], bowlingInnings: 0 }], 'All-Rounders', 'points').length,
    0,
  );
  assert.equal(rankPlayers(rows.slice(0, 2), 'All-Rounders', 'points').length, 2);
});

test('qualified and provisional rankings keep undefined averages out while preserving raw statistics', () => {
  const rows = [
    {
      id: 'not-out', name: 'Not out', innings: 3, balls: 30, runs: 48, dismissals: 0,
      average: null, strikeRate: 160, bowlingInnings: 0, legalBalls: 0, wickets: 0,
      bowlingAverage: null, economy: null, bowlingStrikeRate: null, battingRating: 640,
    },
    {
      id: 'dismissed', name: 'Dismissed', innings: 3, balls: 30, runs: 45, dismissals: 3,
      average: 15, strikeRate: 150, bowlingInnings: 3, legalBalls: 24, wickets: 0,
      bowlingAverage: null, economy: 4.5, bowlingStrikeRate: null, battingRating: 610,
      bowlingRating: 120, allRounderRating: 73.2,
    },
    {
      id: 'all-rounder', name: 'All rounder', innings: 3, balls: 30, runs: 45, dismissals: 2,
      average: 22.5, strikeRate: 150, bowlingInnings: 3, legalBalls: 24, wickets: 3,
      bowlingAverage: 8, economy: 6, bowlingStrikeRate: 8, battingRating: 700,
      bowlingRating: 600, allRounderRating: 420,
    },
  ];
  assert.deepEqual(rankPlayers(rows, 'Batters', 'average').map((player) => player.id), [
    'all-rounder',
    'dismissed',
  ]);
  assert.deepEqual(rankPlayers(rows, 'Bowlers', 'bowlingAverage').map((player) => player.id), [
    'all-rounder',
  ]);
  assert.deepEqual(rankPlayers(rows, 'Bowlers', 'economy').map((player) => player.id), [
    'dismissed',
    'all-rounder',
  ]);
  assert.deepEqual(rankPlayers(rows, 'All-Rounders', 'allRounderRating').map((player) => player.id), [
    'all-rounder',
    'dismissed',
  ]);
  assert.deepEqual(
    rankPlayers(rows, 'Batters', 'battingRating', {}, { provisional: true }).map((player) => player.id),
    [],
  );
  assert.deepEqual(
    rankPlayers(rows, 'Batters', 'runs', {}, { provisional: true }),
    [],
  );
  const shortSample = {
    ...rows[0],
    id: 'short-sample',
    innings: 1,
    balls: 12,
    runs: 20,
    battingRating: 500,
  };
  const qualified = rankPlayers([...rows, shortSample], 'Batters', 'battingRating');
  const provisional = rankPlayers([...rows, shortSample], 'Batters', 'battingRating', {}, { provisional: true });
  assert.deepEqual(qualified.map((player) => player.id), ['all-rounder', 'not-out', 'dismissed']);
  assert.deepEqual(provisional.map((player) => player.id), ['short-sample']);
  assert.equal(
    qualified.some((player) => provisional.some((candidate) => candidate.id === player.id)),
    false,
  );
});

test('ratings are bounded, use both disciplines, and keep legacy points separate', () => {
  const teams = [side('A', ['a1', 'a2']), side('B', ['b1', 'b2'])];
  const histories = Array.from({ length: 4 }, (_, index) =>
    completedMatch(
      `rating-${index}`,
      teams,
      0,
      [
        { bat: 4, boundary: true },
        ...Array.from({ length: 4 }, () => ({ bat: 0 })),
        { wicket: { kind: 'bowled', player: 'a1' } },
      ],
      [
        ...Array.from({ length: 5 }, () => ({ bat: 0 })),
        { wicket: { kind: 'bowled', player: 'b1' } },
      ],
    ),
  );
  const data = {
    players: [{ id: 'a1', name: 'All-rounder' }, { id: 'b1', name: 'Opponent' }],
    matches: histories.map((history) => history.match),
    innings: histories.flatMap((history) => history.innings),
    events: histories.flatMap((history) => history.events),
  };
  const allRounder = playerTotals(data).find((player) => player.id === 'a1');
  assert.equal(allRounder.runs, 16);
  assert.equal(allRounder.wickets, 4);
  assert.equal(allRounder.legalBalls, 24);
  assert.equal(allRounder.points, 96);
  assert.ok(allRounder.battingRating > 0 && allRounder.battingRating <= 1000);
  assert.ok(allRounder.bowlingRating > 0 && allRounder.bowlingRating <= 1000);
  assert.ok(Math.abs(allRounder.allRounderRating - (allRounder.battingRating * allRounder.bowlingRating) / 1000) < 1e-9);
  assert.deepEqual(
    rankPlayers([allRounder], 'All-Rounders', 'allRounderRating').map((player) => player.id),
    ['a1'],
  );
});

test('filters and duplicate records do not create duplicate leaderboard contributions', () => {
  const teams = [side('A', ['a1', 'a2']), side('B', ['b1', 'b2'])];
  const first = completedMatch(
    'first',
    teams,
    0,
    Array.from({ length: 6 }, () => ({ bat: 1, running: 1 })),
    Array.from({ length: 6 }, () => ({ bat: 0 })),
  );
  const second = completedMatch(
    'second',
    teams,
    0,
    Array.from({ length: 6 }, () => ({ bat: 2, running: 0 })),
    Array.from({ length: 6 }, () => ({ bat: 0 })),
  );
  first.match.date = '2026-01-01';
  second.match.date = '2026-02-01';
  second.match.tournamentId = 'cup';
  const data = {
    players: [{ id: 'a1', name: 'A one' }, { id: 'b1', name: 'B one' }],
    matches: [first.match, second.match, first.match],
    innings: [...first.innings, ...second.innings, ...first.innings],
    events: [...first.events, ...second.events, ...first.events],
  };
  const all = playerTotals(data).find((player) => player.id === 'a1');
  const cup = playerTotals(data, { tournament: 'cup' }).find((player) => player.id === 'a1');
  const recent = playerTotals(data, { since: '2026-01-15' }).find((player) => player.id === 'a1');
  assert.equal(all.runs, 15);
  assert.equal(cup.runs, 12);
  assert.equal(recent.runs, 12);
  assert.equal(playerTotals(data, { teamId: 'A' }).find((player) => player.id === 'a1').runs, 15);
});
