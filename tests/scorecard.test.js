import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStates, replay } from '../lib/engine.js';
import { buildScorecard, scorecardFilename } from '../lib/scorecard.js';
import { createScorecardPdf } from '../lib/scorecardPdf.js';

const teams = [
  { id: 'a', name: 'Youngs Squad', squad: ['a1', 'a2', 'a3'].map((id) => ({ id, name: id })) },
  {
    id: 'b',
    name: 'Warriors',
    squad: ['b1', 'b2', 'b3'].map((id) => ({ id, name: id })),
  },
];
const match = {
  id: 'match',
  status: 'completed',
  teams,
  date: '2026-10-22',
  venue: 'Local ground',
  firstBat: 0,
  toss: '0',
  decision: 'bat',
  rules: { overs: 1, size: 3, maxBowler: 1, freeHit: false },
};
const delivery = (props = {}) => ({
  type: 'delivery',
  bat: 0,
  extra: 'none',
  extraRuns: 0,
  running: 0,
  ...props,
});
const innings = [
  { id: 'i1', matchId: match.id, number: 1, striker: 'a1', nonStriker: 'a2', bowler: 'b1' },
  { id: 'i2', matchId: match.id, number: 2, striker: 'b1', nonStriker: 'b2', bowler: 'a1' },
];

function completedEvents(chaseEvents = [delivery({ bat: 4, boundary: true })]) {
  return [
    { ...delivery({ extra: 'wide' }), id: 'e1', inningsId: 'i1', seq: 1 },
    { ...delivery({ extra: 'noBall' }), id: 'e2', inningsId: 'i1', seq: 2 },
    {
      ...delivery({ wicket: { kind: 'bowled', player: 'a1' } }),
      id: 'e3',
      inningsId: 'i1',
      seq: 3,
    },
    { type: 'batter', player: 'a3', id: 'e4', inningsId: 'i1', seq: 4 },
    {
      ...delivery({ wicket: { kind: 'caught', player: 'a3' } }),
      id: 'e5',
      inningsId: 'i1',
      seq: 5,
    },
    ...chaseEvents.map((event, index) => ({
      ...event,
      id: `e${index + 6}`,
      inningsId: 'i2',
      seq: index + 6,
    })),
  ];
}

function statesFor(events = completedEvents()) {
  return matchStates(match, innings, events);
}

test('completed scorecard uses actual scores, extras, bowling figures, fall of wickets, and result', () => {
  const states = statesFor();
  const scorecard = buildScorecard(match, states);
  assert.equal(scorecard.result, 'Warriors won by 2 wickets');
  assert.equal(scorecard.innings[0].score, '2/2');
  assert.equal(scorecard.innings[0].extras.total, 2);
  assert.equal(scorecard.innings[0].extras.wide, 1);
  assert.equal(scorecard.innings[0].extras.noBall, 1);
  assert.equal(scorecard.innings[0].falls.length, 2);
  assert.deepEqual(
    scorecard.innings[0].batters.map((player) => player.dismissal),
    ['bowled', 'Not out', 'caught'],
  );
  assert.equal(scorecard.innings[0].bowlers[0].runs, 2);
  assert.equal(scorecard.innings[1].batters[0].strikeRate, '400.00');
  assert.match(scorecard.toss, /Youngs Squad won the toss and elected to bat/);
  assert.equal(scorecard.playerOfTheMatch, '');
});

test('scorecard model reports ties accurately and rejects unfinished matches', () => {
  const tiedEvents = completedEvents([
    delivery({ bat: 1, running: 1 }),
    delivery({ bat: 1, running: 1 }),
    ...Array.from({ length: 4 }, () => delivery()),
  ]);
  const tied = buildScorecard(match, statesFor(tiedEvents));
  assert.equal(tied.result, 'Match tied');

  const unfinished = { ...match, status: 'live' };
  assert.throws(() => buildScorecard(unfinished, statesFor()), /after both innings are finalized/);
});

test('PDF generation produces a multi-page A4 report and a safe dated filename', () => {
  const states = statesFor();
  const doc = createScorecardPdf(match, states);
  const pdf = Buffer.from(doc.output('arraybuffer'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.getNumberOfPages() >= 2);
  assert.match(scorecardFilename(match), /^Crease_Youngs_Squad_vs_Warriors_22-10-2026\.pdf$/);

  const longNamesState = (state) => ({
    ...state,
    batting: Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [
        `batter-${index}`,
        {
          id: `batter-${index}`,
          name: `Player with a very long scorecard name number ${index}`,
          played: true,
          out: index % 2 === 0,
          dismissal: 'run out',
          runs: index,
          balls: 10,
          fours: 1,
          sixes: 0,
        },
      ]),
    ),
    bowling: Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [
        `bowler-${index}`,
        {
          id: `bowler-${index}`,
          name: `Bowler with another very long name number ${index}`,
          bowled: true,
          balls: 6,
          maidens: 0,
          runs: index,
          wickets: index % 4,
        },
      ]),
    ),
    falls: Array.from({ length: 20 }, (_, index) => ({
      runs: index * 3,
      wickets: index + 1,
      balls: index + 1,
      player: 'a1',
    })),
  });
  const longDoc = createScorecardPdf(match, states.map(longNamesState));
  assert.ok(longDoc.getNumberOfPages() > 2);
});
