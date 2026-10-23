import test from 'node:test';
import assert from 'node:assert/strict';
import { teamStatistics, sortStatistics, compareStatistic } from '../lib/statistics.js';
import { toCsv } from '../lib/reports.js';

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

test('team statistics use only completed matches for the selected historical team', () => {
  const teams = [side('A', ['a1', 'a2']), side('B', ['b1', 'b2'])];
  const firstInnings = [
    ...Array.from({ length: 5 }, () => ({ bat: 1, running: 0 })),
    { wicket: { kind: 'bowled', player: 'a1' } },
  ];
  const one = completedMatch('one', teams, 0, firstInnings, [
    { wicket: { kind: 'bowled', player: 'b1' } },
  ]);
  const otherTeams = [side('C', ['c1', 'c2']), side('D', ['d1', 'd2'])];
  const two = completedMatch(
    'two',
    otherTeams,
    0,
    Array.from({ length: 6 }, () => ({ bat: 4, boundary: true })),
    [{ wicket: { kind: 'bowled', player: 'd1' } }],
  );
  const ongoing = { ...one.match, id: 'live', status: 'live' };
  const stats = teamStatistics(
    'A',
    [one.match, two.match, ongoing],
    [...one.innings, ...two.innings],
    [...one.events, ...two.events],
  );
  assert.equal(stats.matches, 1);
  assert.equal(stats.won, 1);
  assert.equal(stats.runs, 5);
  assert.equal(stats.batting.find((player) => player.id === 'a1').runs, 5);
  assert.equal(stats.batting.find((player) => player.id === 'a1').average, 5);
  assert.equal(stats.batting.find((player) => player.id === 'a1').strikeRate.toFixed(2), '83.33');
  assert.equal(stats.bowling.find((player) => player.id === 'a1').wickets, 1);
  assert.equal(stats.bowling.find((player) => player.id === 'a1').bowlingAverage, 0);
  assert.equal(stats.bowling.find((player) => player.id === 'a1').economy, 0);
  assert.equal(stats.bowling.find((player) => player.id === 'a1').bowlingStrikeRate, 1);
  assert.equal(stats.bowling.find((player) => player.id === 'a1').dots, 1);
  assert.equal(stats.wickets, 1);
  assert.equal(stats.highest, 5);
  assert.equal(stats.noResults, 0);
  const opposition = teamStatistics('B', [one.match], one.innings, one.events);
  const leadingBowler = opposition.bowling.find((player) => player.id === 'b1');
  assert.equal(leadingBowler.runs, 5);
  assert.equal(leadingBowler.wickets, 1);
  assert.equal(leadingBowler.bowlingAverage, 5);
  assert.equal(leadingBowler.economy, 5);
  assert.equal(leadingBowler.bowlingStrikeRate, 6);
  assert.equal(leadingBowler.dots, 1);
});

test('undefined averages stay null, qualification thresholds prevent tiny-sample leaders', () => {
  const teams = [side('A', ['a1', 'a2']), side('B', ['b1', 'b2'])];
  const match = completedMatch(
    'single',
    teams,
    0,
    Array.from({ length: 6 }, () => ({ bat: 1, running: 1 })),
    [{ wicket: { kind: 'bowled', player: 'b1' } }],
  );
  const stats = teamStatistics('A', [match.match], match.innings, match.events);
  const batsman = stats.batting.find((player) => player.id === 'a1');
  const bowler = stats.bowling.find((player) => player.id === 'a1');
  assert.equal(batsman.average, null);
  assert.equal(batsman.qualified, false);
  assert.equal(bowler.qualified, false);
});

test('sort preserves undefined values at the end and comparisons require meaningful data', () => {
  assert.deepEqual(
    sortStatistics(
      [
        { n: 'one', average: null },
        { n: 'two', average: 20 },
      ],
      'average',
    ).map((row) => row.n),
    ['two', 'one'],
  );
  assert.equal(compareStatistic(20, 18, 'average'), 'a');
  assert.equal(compareStatistic(null, 18, 'average'), null);
  assert.equal(compareStatistic(3, 4, 'economy', true), 'a');
});

test('CSV keeps numeric data numeric and escapes text and spreadsheet formulas', () => {
  const csv = toCsv(['Player', 'Runs', 'Note'], [['=1+1', 24, 'A "quoted" name']]);
  assert.match(csv, /"'=1\+1",24,"A ""quoted"" name"/);
  assert.ok(csv.startsWith('\uFEFF'));
});
