import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {
  db,
  createWorkspace,
  saveRecord,
  saveTeam,
  createMatch,
  changeMatch,
  all,
  exportBackup,
  importBackup,
  validateBackup,
  uuid,
} from '../lib/db.js';
test('workspace isolation, transaction rollback, revisions, undo, backup and finalization', async () => {
  await db.delete();
  await db.open();
  const w = await createWorkspace('Scorer');
  assert.equal((await all(w.id)).players.length, 0);
  const ps = [];
  for (let n = 0; n < 4; n++) ps.push(await saveRecord(w.id, 'players', { name: `Player ${n}` }));
  const teams = [];
  for (let n = 0; n < 2; n++) {
    const t = { id: uuid(), name: `Team ${n}` };
    await saveTeam(
      w.id,
      t,
      ps.slice(n * 2, n * 2 + 2).map((p) => p.id),
    );
    teams.push({ ...t, squad: ps.slice(n * 2, n * 2 + 2) });
  }
  await assert.rejects(saveRecord(uuid(), 'players', { ...ps[0], name: 'Overwrite' }));
  let m = await createMatch(
    w.id,
    {
      teams,
      date: '2026-10-21',
      firstBat: 0,
      rules: { overs: 1, size: 2, maxBowler: 1, freeHit: true },
    },
    { striker: ps[0].id, nonStriker: ps[1].id, bowler: ps[2].id },
  );
  const deliver = (event) =>
    changeMatch(w.id, m.id, m.revision, {
      type: 'event',
      event: {
        id: uuid(),
        type: 'delivery',
        bat: 0,
        extra: 'none',
        extraRuns: 0,
        running: 0,
        ...event,
      },
    });
  const original = m;
  m = await deliver({ bat: 4, boundary: true });
  await assert.rejects(
    changeMatch(w.id, m.id, original.revision, {
      type: 'event',
      event: { id: uuid(), type: 'delivery' },
    }),
    /another tab/,
  );
  for (let i = 1; i < 6; i++) m = await deliver({});
  m = await changeMatch(w.id, m.id, m.revision, {
    type: 'startChase',
    opening: { striker: ps[2].id, nonStriker: ps[3].id, bowler: ps[0].id },
  });
  m = await deliver({ bat: 6, boundary: true });
  m = await changeMatch(w.id, m.id, m.revision, { type: 'finalize' });
  assert.equal(
    (await changeMatch(w.id, m.id, m.revision, { type: 'finalize' })).revision,
    m.revision,
  );
  assert.equal((await all(w.id)).matches.filter((x) => x.status === 'completed').length, 1);
  const backup = await exportBackup(w);
  validateBackup(backup);
  await importBackup(w.id, backup);
  assert.equal((await all(w.id)).events.length, 7);
  m = (await all(w.id)).matches[0];
  const bad = structuredClone(backup);
  bad.events[0].inningsId = uuid();
  await assert.rejects(importBackup(w.id, bad));
  assert.equal((await all(w.id)).events.length, 7);
  const broken = structuredClone(backup);
  broken.players[0].id = broken.players[1].id;
  assert.throws(() => validateBackup(broken));
  m = await changeMatch(w.id, m.id, m.revision, { type: 'reopen' });
  m = await changeMatch(w.id, m.id, m.revision, { type: 'undo' });
  assert.equal((await all(w.id)).events.length, 6);
  assert.equal((await all(w.id)).audits.length, 1);
  // Inject a storage error after a mutation to prove transaction rollback.
  const before = (await all(w.id)).players.length;
  await assert.rejects(
    db.transaction('rw', db.players, async () => {
      await db.players.add({ id: uuid(), workspaceId: w.id, name: 'Must roll back' });
      throw new Error('Simulated quota failure');
    }),
  );
  assert.equal((await all(w.id)).players.length, before);
  db.close();
  await db.open();
  assert.equal((await all(w.id)).matches.length, 1);
  await db.delete();
});

test('version 1 migration preserves existing records', async () => {
  const old = new Dexie('crease-local');
  old.version(1).stores({ workspaces: 'id', players: 'id,workspaceId', teams: 'id,workspaceId', memberships: 'id,workspaceId,teamId', matches: 'id,workspaceId', innings: 'id,workspaceId,matchId', events: 'id,workspaceId,matchId,inningsId', audits: 'id,workspaceId,matchId' });
  const id = uuid(), playerId = uuid();
  await old.workspaces.add({ id, name: 'Existing scorer' });
  await old.players.add({ id: playerId, workspaceId: id, name: 'Existing player' });
  old.close();
  await db.open();
  assert.equal((await all(id)).players[0].id, playerId);
  assert.equal((await all(id)).drafts.length, 0);
  await db.delete();
});
