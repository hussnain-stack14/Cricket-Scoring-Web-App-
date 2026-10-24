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
  assert.equal(rankPlayers(rows, 'Bowlers', 'economy')[0].id, '00');
  assert.equal(rankPlayers(rows, 'Bowlers', 'bowlingAverage')[0].id, '00');
  assert.equal(rankPlayers(rows, 'Bowlers', 'bowlingStrikeRate')[0].id, '00');
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
