import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  createWorkspace,
  saveRecord,
  createMatch,
  deleteMatch,
  deleteRecord,
  all,
  changeMatch,
  activateAccountWorkspace,
  exportBackup,
  validateBackup,
} from '../lib/db.js';
import { upcomingMatches } from '../lib/matchLifecycle.js';
import { pullChanges, pushChanges } from '../lib/sync.js';

test('upcoming dates sort by instant and retain overdue fixtures and exclude drafts, deleted, completed and cancelled', () => {
  const rows = ['upcoming', 'completed', 'cancelled', 'draft', 'live'].map((status, i) => ({
    id: i,
    status,
    scheduledAt: '2030-01-02T10:00:00Z',
  }));
  rows.push(
    { id: 8, status: 'upcoming', scheduledAt: '2030-01-01T20:00:00+05:00' },
    { id: 9, status: 'upcoming', date: '2020-01-01' },
    { id: 10, status: 'upcoming', date: '2031-01-01', deletedAt: 'today' },
  );
  assert.deepEqual(
    upcomingMatches(rows, Date.parse('2030-01-01')).map((m) => m.id),
    [9, 8, 0],
  );
});
test('drafts retain entered fields, update without duplicates, consume only the selected draft and delete offline', async () => {
  await db.delete();
  await db.open();
  const w = await createWorkspace('Scorer');
  const teams = await Promise.all(
    ['North', 'South'].map((name) => saveRecord(w.id, 'teams', { name })),
  );
  const draft = {
    step: 1,
    teamA: teams[0].id,
    teamB: teams[1].id,
    teamNameA: 'North',
    teamNameB: 'South',
    squadA: [],
    squadB: [],
    rules: w.rules,
    date: '2030-01-01',
    venue: 'Ground',
  };
  const first = await saveRecord(w.id, 'drafts', draft);
  const second = await saveRecord(w.id, 'drafts', draft);
  await saveRecord(w.id, 'drafts', { ...first, venue: 'Updated' });
  assert.equal((await all(w.id)).drafts.length, 2);
  assert.equal((await db.drafts.get(first.id)).venue, 'Updated');
  validateBackup(await exportBackup(w));
  const match = await createMatch(
    w.id,
    {
      teams: teams.map((t) => ({ ...t, squad: [] })),
      rules: w.rules,
      date: '2030-01-01',
      scheduledAt: '2030-01-01T10:00:00Z',
      firstBat: 0,
    },
    undefined,
    first.id,
  );
  assert.equal(match.status, 'upcoming');
  assert.deepEqual(
    (await all(w.id)).drafts.map((d) => d.id),
    [second.id],
  );
  await assert.rejects(changeMatch(w.id, match.id, 0, { type: 'start' }), /toss/);
  assert.equal((await db.matches.get(match.id)).status, 'upcoming');
  await deleteRecord(w.id, 'drafts', second.id);
  assert.equal((await all(w.id)).drafts.length, 0);
  await deleteMatch(w.id, match.id);
  assert.equal((await all(w.id)).matches.length, 0);
  assert.equal((await all(w.id)).innings.length, 0);
  assert.ok((await db.matches.get(match.id)).deletedAt);
  assert.equal((await all(w.id)).teams.length, 2);
});
test('offline tombstones survive stale pulls until acknowledgment; owner authorization and history are preserved', async () => {
  await db.delete();
  await db.open();
  const w = await activateAccountWorkspace('account', 'Owner', { role: 'owner' });
  const teams = await Promise.all(['A', 'B'].map((name) => saveRecord(w.id, 'teams', { name })));
  const player = await saveRecord(w.id, 'players', { name: 'Historical player' });
  const match = await createMatch(w.id, {
    teams: teams.map((t) => ({ ...t, squad: [] })),
    rules: w.rules,
    date: '2026-01-01',
    firstBat: 0,
  });
  await db.pendingChanges.clear();
  await deleteMatch(w.id, match.id);
  const pending = await db.pendingChanges.where({ workspaceId: w.id }).toArray();
  assert.equal(pending.length, 1);
  assert.ok(pending.every((c) => c.deleted));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        records: [
          { table: 'matches', recordId: match.id, data: match, revision: 1, deletedAt: null },
        ],
        pulledAt: new Date().toISOString(),
      });
    await pullChanges(w.id);
    assert.equal((await all(w.id)).matches.length, 0);
    assert.equal(await db.pendingChanges.count(), 1);
    globalThis.fetch = async (_url, options) =>
      Response.json({
        applied: JSON.parse(options.body).changes.map((c) => ({ ...c, revision: 2 })),
        rejected: [],
        pushedAt: new Date().toISOString(),
      });
    await pushChanges(w.id);
    assert.equal(await db.pendingChanges.count(), 0);
    assert.equal((await all(w.id)).players[0].id, player.id);
    const meta = await db.syncMeta.get(w.id);
    await db.syncMeta.put({ ...meta, role: 'scorer' });
    await assert.rejects(deleteRecord(w.id, 'players', player.id), /owner/);
    await assert.rejects(saveRecord(w.id, 'players', { ...player, archived: true }), /owner/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
