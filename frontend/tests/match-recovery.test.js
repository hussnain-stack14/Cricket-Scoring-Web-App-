import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planMatchRecovery,
  recoveredCompletedMatch,
  recoveryFingerprint,
} from '../backend/matchRecovery.js';

function history() {
  const match = {
    id: 'match-1',
    workspaceId: 'device-a',
    status: 'completed',
    firstBat: 0,
    date: '2026-10-25',
    rules: { overs: 1, size: 2, maxBowler: 1, freeHit: true },
    teams: [
      { id: 'team-a', name: 'A', squad: [{ id: 'a' }, { id: 'b' }] },
      { id: 'team-b', name: 'B', squad: [{ id: 'x' }, { id: 'y' }] },
    ],
  };
  const innings = [
    {
      id: 'innings-1',
      workspaceId: 'device-a',
      matchId: match.id,
      number: 1,
      striker: 'a',
      nonStriker: 'b',
      bowler: 'x',
    },
    {
      id: 'innings-2',
      workspaceId: 'device-a',
      matchId: match.id,
      number: 2,
      striker: 'x',
      nonStriker: 'y',
      bowler: 'a',
    },
  ];
  const events = [
    {
      id: 'event-1',
      workspaceId: 'device-a',
      matchId: match.id,
      inningsId: innings[0].id,
      seq: 1,
      type: 'delivery',
      bat: 0,
      extra: 'none',
      extraRuns: 0,
      running: 0,
      wicket: { kind: 'bowled', player: 'a' },
    },
    {
      id: 'event-2',
      workspaceId: 'device-a',
      matchId: match.id,
      inningsId: innings[1].id,
      seq: 2,
      type: 'delivery',
      bat: 1,
      extra: 'none',
      extraRuns: 0,
      running: 1,
    },
  ];
  return { match, innings, events };
}

test('verified deleted-match recovery restores only matching tombstones and creates only absent events', () => {
  const source = history();
  const cloud = [
    {
      table: 'matches',
      recordId: source.match.id,
      data: { ...source.match, workspaceId: 'cloud' },
      revision: 8,
      deletedAt: new Date(),
    },
    {
      table: 'innings',
      recordId: source.innings[0].id,
      data: { ...source.innings[0], workspaceId: 'cloud' },
      revision: 4,
      deletedAt: new Date(),
    },
    {
      table: 'innings',
      recordId: source.innings[1].id,
      data: { ...source.innings[1], workspaceId: 'cloud' },
      revision: 3,
      deletedAt: null,
    },
    {
      table: 'events',
      recordId: source.events[0].id,
      data: { ...source.events[0], workspaceId: 'cloud' },
      revision: 7,
      deletedAt: new Date(),
    },
  ];
  const plan = planMatchRecovery(source, cloud, { expectedEvents: 2 });
  assert.equal(plan.ready, true);
  assert.deepEqual(
    plan.actions.map((item) => item.action),
    ['restore', 'restore', 'unchanged', 'restore', 'create'],
  );
  assert.equal(plan.validation.replay.innings[0].wickets, 1);
  assert.equal(plan.validation.replay.innings[1].runs, 1);
  assert.equal(
    recoveryFingerprint(source),
    recoveryFingerprint({ ...source, match: { ...source.match, workspaceId: 'device-b' } }),
  );
  assert.deepEqual(recoveredCompletedMatch(source.match, 2).syncSnapshot, {
    innings: 2,
    events: 2,
    verified: true,
  });
});

test('recovery rejects changed payloads and never treats an arbitrary tombstone as restorable', () => {
  const source = history();
  const cloud = [
    {
      table: 'matches',
      recordId: source.match.id,
      data: { ...source.match, status: 'live' },
      revision: 8,
      deletedAt: new Date(),
    },
  ];
  const plan = planMatchRecovery(source, cloud, { expectedEvents: 2 });
  assert.equal(plan.ready, false);
  assert.match(plan.conflicts[0].reason, /different payload/);
});
