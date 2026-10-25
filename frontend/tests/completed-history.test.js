import test from 'node:test';
import assert from 'node:assert/strict';
import { completedHistoryError } from '../backend/completedHistory.js';

const team = (id, players) => ({ id, name: id, squad: players.map((id) => ({ id, name: id })) });
const match = {
  id: 'match', status: 'completed', firstBat: 0,
  teams: [team('a', ['a1', 'a2', 'a3']), team('b', ['b1', 'b2', 'b3'])],
  rules: { overs: 1, size: 3, maxBowler: 1, freeHit: false },
};
const delivery = (extra = {}) => ({ type: 'delivery', bat: 0, extra: 'none', extraRuns: 0, running: 0, ...extra });
const innings = [
  { id: 'i1', matchId: 'match', number: 1, striker: 'a1', nonStriker: 'a2', bowler: 'b1' },
  { id: 'i2', matchId: 'match', number: 2, striker: 'b1', nonStriker: 'b2', bowler: 'a1' },
];
const events = [
  { ...delivery({ extra: 'wide' }), id: 'e1', inningsId: 'i1', seq: 1 },
  { ...delivery({ extra: 'noBall' }), id: 'e2', inningsId: 'i1', seq: 2 },
  { ...delivery({ wicket: { kind: 'bowled', player: 'a1' } }), id: 'e3', inningsId: 'i1', seq: 3 },
  { type: 'batter', player: 'a3', id: 'e4', inningsId: 'i1', seq: 4 },
  { ...delivery({ wicket: { kind: 'caught', player: 'a3' } }), id: 'e5', inningsId: 'i1', seq: 5 },
  { ...delivery({ bat: 4, boundary: true }), id: 'e6', inningsId: 'i2', seq: 6 },
];

test('only replayable, finished event histories can commit a completed match', () => {
  assert.equal(completedHistoryError(match, innings, events, { innings: 2, events: 6 }), null);
  assert.match(completedHistoryError(match, innings, events.slice(0, -1), { innings: 2, events: 6 }), /waiting/);
  assert.match(completedHistoryError(match, innings, [...events, { ...events[0], id: 'orphan', inningsId: 'gone' }], { innings: 2, events: 7 }), /not linked/);
});
