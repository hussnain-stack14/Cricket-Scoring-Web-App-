import test from 'node:test';
import assert from 'node:assert/strict';
import { replay, overs, rate, career, result } from '../lib/engine.js';
const match = {
  firstBat: 0,
  rules: { overs: 3, size: 3, maxBowler: 2, freeHit: true },
  teams: [
    { name: 'A', squad: ['a', 'b', 'c'].map((id) => ({ id, name: id })) },
    { name: 'B', squad: ['x', 'y', 'z'].map((id) => ({ id, name: id })) },
  ],
};
const inn = { number: 1, striker: 'a', nonStriker: 'b', bowler: 'x' };
const ball = (props = {}) => ({
  type: 'delivery',
  bat: 0,
  extra: 'none',
  extraRuns: 0,
  running: 0,
  ...props,
});
test('15 legal balls are 2.3, raw aggregate rates retain correct denominators', () => {
  assert.equal(overs(15), '2.3');
  assert.equal(rate(80, 1), '80.00');
  assert.equal(rate(80, 55, 100), '145.45');
  assert.equal(rate(0, 0), '—');
});
test('five runs count as running, not a boundary, and rotate the strike', () => {
  const s = replay(match, inn, [ball({ bat: 5, running: 5 })]);
  assert.equal(s.runs, 5);
  assert.equal(s.batting.a.runs, 5);
  assert.equal(s.batting.a.fours, 0);
  assert.equal(s.batting.a.sixes, 0);
  assert.equal(s.balls, 1);
  assert.equal(s.striker, 'b');
});
test('wide/no-ball separate batter balls and legal deliveries; running excludes penalties', () => {
  const s = replay(match, inn, [
    ball({ extra: 'wide' }),
    ball({ extra: 'noBall', bat: 1, running: 1 }),
  ]);
  assert.equal(s.runs, 3);
  assert.equal(s.balls, 0);
  assert.equal(s.batting.a.balls, 1);
  assert.equal(s.batting.a.runs, 1);
  assert.equal(s.striker, 'b');
  assert.equal(s.bowling.x.runs, 3);
  assert.equal(s.freeHit, true);
});
test('byes/leg-byes and no-ball byes exclude bowler runs', () => {
  const s = replay(match, inn, [
    ball({ extra: 'bye', extraRuns: 2, running: 2 }),
    ball({ extra: 'legBye', extraRuns: 1, running: 1 }),
    ball({ extra: 'noBallBye', extraRuns: 2, running: 2 }),
  ]);
  assert.equal(s.runs, 6);
  assert.equal(s.bowling.x.runs, 1);
  assert.equal(s.balls, 2);
  assert.equal(s.extras.bye, 4);
  assert.equal(s.extras.legBye, 1);
});
test('dot balls are deliveries with no runs charged to the bowler', () => {
  const s = replay(match, inn, [
    ball({ extra: 'bye', extraRuns: 1, running: 1 }),
    ball({ extra: 'wide' }),
    ball(),
  ]);
  assert.equal(s.bowling.x.dots, 2);
  assert.deepEqual(
    s.deliveries.map((delivery) => delivery.chargedBowlerRuns),
    [0, 1, 0],
  );
});
test('free-hit survives wide, forbids caught and expires on legal delivery', () => {
  const start = [ball({ extra: 'noBall' }), ball({ extra: 'wide' })];
  assert.throws(
    () => replay(match, inn, [...start, ball({ wicket: { kind: 'caught', player: 'a' } })]),
    /free hit/,
  );
  assert.equal(replay(match, inn, [...start, ball()]).freeHit, false);
});
test('run out credits no bowler wicket and explicitly sets survivor end', () => {
  const s = replay(match, inn, [
    ball({ wicket: { kind: 'run out', player: 'b', survivorEnd: 'nonStriker' } }),
  ]);
  assert.equal(s.wickets, 1);
  assert.equal(s.bowling.x.wickets, 0);
  assert.equal(s.nonStriker, 'a');
  assert.equal(s.needBatter, 'striker');
});
test('caught on sixth delivery: new batter at non-striker end, new bowler mandatory', () => {
  const es = [
    ...Array.from({ length: 5 }, () => ball()),
    ball({ wicket: { kind: 'caught', player: 'a' } }),
  ];
  const s = replay(match, inn, es);
  assert.equal(s.striker, 'b');
  assert.equal(s.needBatter, 'nonStriker');
  assert.equal(s.needBowler, true);
  assert.throws(
    () =>
      replay(match, inn, [...es, { type: 'batter', player: 'c' }, { type: 'bowler', player: 'x' }]),
    /different bowler/,
  );
});
test('over maiden and running at sixth ball swap ends correctly', () => {
  const s = replay(match, inn, [
    ...Array.from({ length: 5 }, () => ball()),
    ball({ extra: 'bye', extraRuns: 1, running: 1 }),
  ]);
  assert.equal(s.bowling.x.maidens, 1);
  assert.equal(s.striker, 'a');
});
test('bowler limits enforced', () => {
  const m = { ...match, rules: { ...match.rules, maxBowler: 1 } };
  const six = () => Array.from({ length: 6 }, () => ball());
  assert.throws(
    () =>
      replay(m, inn, [
        ...six(),
        { type: 'bowler', player: 'y' },
        ...six(),
        { type: 'bowler', player: 'x' },
      ]),
    /Maximum/,
  );
});
test('all out, target and result margins', () => {
  const s = replay(match, inn, [
    ball({ wicket: { kind: 'bowled', player: 'a' } }),
    { type: 'batter', player: 'c' },
    ball({ wicket: { kind: 'lbw', player: 'c' } }),
  ]);
  assert.equal(s.done, true);
  assert.equal(s.wickets, 2);
  const chase = replay(
    match,
    { number: 2, striker: 'x', nonStriker: 'y', bowler: 'a' },
    [ball({ bat: 4, boundary: true })],
    3,
  );
  assert.equal(result(match, [{ runs: 2 }, chase]), 'B won by 2 wickets');
  assert.equal(result(match, [{ runs: 4 }, { runs: 4, done: true }]), 'Match tied');
  assert.equal(result(match, [{ runs: 5 }, { runs: 4, done: true }]), 'A won by 1 run');
});
test('winning wide precedes attempted dismissal', () => {
  const s = replay(
    match,
    inn,
    [ball({ extra: 'wide', wicket: { kind: 'stumped', player: 'a' } })],
    1,
  );
  assert.equal(s.wickets, 0);
  assert.equal(s.done, true);
});
test('undo via replay restores innings end, strike and free hit', () => {
  const es = Array.from({ length: 6 }, () => ball());
  const m = { ...match, rules: { ...match.rules, overs: 1 } };
  assert.equal(replay(m, inn, es).done, true);
  const s = replay(m, inn, es.slice(0, -1));
  assert.equal(s.done, false);
  assert.equal(s.needBowler, false);
  assert.equal(s.balls, 5);
});
test('career combines totals and excludes reopened matches', () => {
  const m1 = { ...match, id: 'm1', status: 'completed' },
    m2 = { ...match, id: 'm2', status: 'completed' };
  const innings = [
    { ...inn, id: 'i1', matchId: 'm1' },
    { ...inn, id: 'i2', matchId: 'm2' },
  ];
  const events = [20, 60].flatMap((n, i) =>
    Array.from({ length: n / 4 }, (_, seq) => ({
      ...ball({ bat: 4, boundary: true }),
      matchId: `m${i + 1}`,
      inningsId: `i${i + 1}`,
      seq,
    })),
  );
  const first = events.filter((e) => e.matchId === 'm1');
  first.push({
    ...ball({ wicket: { kind: 'bowled', player: 'a' } }),
    matchId: 'm1',
    inningsId: 'i1',
    seq: 5,
  });
  // Keep innings below over breaks for this aggregate fixture by using no-balls and disabling free hits.
  const adjusted = [...first, ...events.filter((e) => e.matchId === 'm2')].map((e) =>
    e.wicket ? e : { ...e, extra: 'noBall' },
  );
  const matches = [m1, m2].map((m) => ({ ...m, rules: { ...m.rules, freeHit: false } }));
  const stats = career('a', matches, innings, adjusted);
  assert.equal(stats.runs, 80);
  assert.equal(stats.average, '80.00');
  assert.equal(stats.notOuts, 1);
  assert.equal(stats.fifties, 1);
  matches[1].status = 'live';
  assert.equal(career('a', matches, innings, adjusted).runs, 20);
});
