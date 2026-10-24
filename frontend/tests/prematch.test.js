import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  createWorkspace,
  activateAccountWorkspace,
  saveRecord,
  saveTeam,
  createMatch,
  changeMatch,
  all,
} from '../lib/db.js';
import { battingFirst, validateMatchStart, scheduledAction } from '../lib/matchLifecycle.js';
import { syncPolicyError } from '../backend/syncPolicy.js';
import { matchStates } from '../lib/engine.js';
import { pullChanges, pushChanges, resolveConflict } from '../lib/sync.js';

async function fixture(role) {
  await db.delete();
  await db.open();
  const w = role
    ? await activateAccountWorkspace('toss-account', 'Scorer', { role })
    : await createWorkspace('Scorer');
  const teams = await Promise.all(
    ['North', 'South'].map((name) => saveRecord(w.id, 'teams', { name })),
  );
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = await saveRecord(w.id, 'players', { name: 'Player ' + i });
    players.push(p);
  }
  await saveTeam(
    w.id,
    teams[0],
    players.slice(0, 2).map((p) => p.id),
  );
  await saveTeam(
    w.id,
    teams[1],
    players.slice(2).map((p) => p.id),
  );
  const match = await createMatch(w.id, {
    teams: teams.map((t) => ({ ...t, squad: [] })),
    rules: w.rules,
    date: '2030-01-01',
    scheduledAt: '2030-01-01T10:00:00Z',
    firstBat: 0,
  });
  const setup = {
    step: 3,
    toss: 1,
    decision: 'field',
    striker: players[0].id,
    nonStriker: players[1].id,
    bowler: players[2].id,
  };
  return { w, match, setup, players };
}

test('toss derives both batting decisions and validates due time, owner override and lineup', () => {
  assert.equal(battingFirst({ toss: 0, decision: 'bat' }), 0);
  assert.equal(battingFirst({ toss: 0, decision: 'field' }), 1);
  assert.equal(battingFirst({ toss: 1, decision: 'bat' }), 1);
  assert.equal(battingFirst({ toss: 1, decision: 'field' }), 0);
  const setup = { toss: 0, decision: 'bat', striker: 'a', nonStriker: 'b', bowler: 'c' };
  const match = {
    status: 'upcoming',
    scheduledAt: '2030-01-01T10:00:00Z',
    rules: {},
    teams: [{ squad: [{ id: 'a' }, { id: 'b' }] }, { squad: [{ id: 'c' }] }],
  };
  const now = Date.parse('2030-01-01T09:59:59Z');
  assert.throws(
    () => validateMatchStart(match, setup, { now, role: 'scorer', earlyOverride: true }),
    /not due/,
  );
  assert.throws(() => validateMatchStart(match, setup, { now }), /not due/);
  assert.equal(validateMatchStart(match, setup, { now, earlyOverride: true }).firstBat, 0);
  assert.throws(
    () =>
      validateMatchStart({ ...match, rules: { allowEarlyStart: false } }, setup, {
        now,
        earlyOverride: true,
      }),
    /not due/,
  );
  assert.equal(validateMatchStart(match, setup, { now: now + 1000, role: 'scorer' }).firstBat, 0);
  assert.throws(
    () => validateMatchStart(match, setup, { now: now + 1000, role: 'viewer' }),
    /Only a scorer/,
  );
  assert.throws(
    () => validateMatchStart(match, { ...setup, nonStriker: 'a' }, { now: now + 1000 }),
    /different/,
  );
  assert.throws(
    () => validateMatchStart(match, { ...setup, bowler: 'a' }, { now: now + 1000 }),
    /squads/,
  );
  assert.equal(scheduledAction(match, now), 'View Details');
  assert.equal(scheduledAction(match, now + 1000), 'Start Match');
  assert.equal(scheduledAction({ ...match, preMatch: { toss: 0 } }, now), 'Resume Setup');
});

test('offline partial setup restores, invalid starts roll back, concurrent starts produce one immutable opening', async () => {
  const { w, match, setup } = await fixture();
  const partial = await changeMatch(w.id, match.id, 0, {
    type: 'preMatch',
    setup: { step: 1, toss: 1 },
  });
  db.close();
  await db.open();
  assert.deepEqual((await db.matches.get(match.id)).preMatch, {
    step: 1,
    toss: 1,
    decision: undefined,
    striker: '',
    nonStriker: '',
    bowler: '',
  });
  await assert.rejects(
    changeMatch(w.id, match.id, partial.revision, {
      type: 'start',
      setup: { ...setup, nonStriker: setup.striker },
      earlyOverride: true,
    }),
    /different/,
  );
  assert.equal((await db.matches.get(match.id)).teams[0].squad.length, 0);
  const results = await Promise.allSettled(
    ['start-one', 'start-two'].map((startId) =>
      changeMatch(w.id, match.id, partial.revision, {
        type: 'start',
        setup,
        startId,
        earlyOverride: true,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const live = await db.matches.get(match.id);
  assert.equal(live.status, 'live');
  assert.equal(live.firstBat, 0);
  assert.equal((await db.innings.toArray()).length, 1);
  const retry = await changeMatch(w.id, match.id, partial.revision, {
    type: 'start',
    startId: live.startId,
    setup,
    earlyOverride: true,
  });
  assert.equal(retry.revision, live.revision);
  const data = await all(w.id);
  const state = matchStates(live, data.innings, data.events)[0];
  assert.equal(state.striker, setup.striker);
  assert.equal(state.bowler, setup.bowler);
  assert.equal(state.needBatter, null);
  // An older child snapshot cannot erase the atomic parent start snapshot.
  assert.equal(
    matchStates(live, [{ ...data.innings[0], striker: '', nonStriker: '', bowler: '' }], [])[0]
      .striker,
    setup.striker,
  );
  await assert.rejects(
    changeMatch(w.id, match.id, live.revision, { type: 'preMatch', setup }),
    /Only scheduled/,
  );
  await db.matches.put({ ...live, status: 'completed' });
  await assert.rejects(
    changeMatch(w.id, match.id, live.revision, {
      type: 'event',
      event: { id: 'ball', type: 'delivery', bat: 1, extra: 'none' },
    }),
    /reopen/,
  );
});

test('due account match starts offline, queues its opening and retains local setup against stale pull', async () => {
  const { w, match, setup } = await fixture('scorer');
  await db.matches.put({ ...match, scheduledAt: new Date(Date.now() - 1000).toISOString() });
  const live = await changeMatch(w.id, match.id, 0, {
    type: 'start',
    setup,
    startId: 'account-start',
  });
  const pending = await db.pendingChanges.toArray();
  assert.ok(pending.some((c) => c.table === 'matches' && c.data.startId === live.startId));
  assert.ok(pending.some((c) => c.table === 'innings' && c.data.striker === setup.striker));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        records: [{ table: 'matches', recordId: match.id, data: match, revision: 1 }],
        pulledAt: new Date().toISOString(),
      });
    await pullChanges(w.id);
    assert.equal((await db.matches.get(match.id)).startId, live.startId);
    globalThis.fetch = async () =>
      Response.json({
        records: [
          {
            table: 'matches',
            recordId: match.id,
            data: { ...live, startId: 'competing-start' },
            revision: 2,
          },
          {
            table: 'events',
            recordId: 'remote-ball',
            data: {
              id: 'remote-ball',
              matchId: match.id,
              startId: 'competing-start',
              type: 'delivery',
            },
            revision: 1,
          },
        ],
        pulledAt: new Date().toISOString(),
      });
    await pullChanges(w.id);
    assert.equal(
      await db.events.count(),
      0,
      'foreign start deliveries must not mix into local play',
    );
    const conflict = (await db.syncMeta.get(w.id)).conflicts.find((c) => c.table === 'matches');
    await assert.rejects(resolveConflict(w.id, conflict, 'remote'), /Both versions are preserved/);
    assert.equal((await db.matches.get(match.id)).startId, live.startId);
    let order = [];
    globalThis.fetch = async (_url, options) => {
      const changes = JSON.parse(options.body).changes;
      order = changes.map((c) => c.table);
      return Response.json({
        applied: changes.map((c) => ({ ...c, revision: 2 })),
        rejected: [],
        pushedAt: new Date().toISOString(),
      });
    };
    await pushChanges(w.id);
    assert.equal(order[0], 'matches');
    assert.equal(await db.pendingChanges.count(), 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('cloud policy prevents replacing an accepted start or bypassing early permissions', async () => {
  const { w, match, setup } = await fixture();
  const live = await changeMatch(w.id, match.id, 0, {
    type: 'start',
    setup,
    startId: 'accepted',
    earlyOverride: true,
  });
  assert.match(
    syncPolicyError({ table: 'matches', data: live, deleted: false }, { data: match }, 'scorer'),
    /not due/,
  );
  assert.equal(
    syncPolicyError({ table: 'matches', data: live, deleted: false }, { data: match }, 'owner'),
    null,
  );
  assert.match(
    syncPolicyError(
      { table: 'matches', data: { ...live, startId: 'other' }, deleted: false },
      { data: live },
      'owner',
    ),
    /already started/,
  );
});
