import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateAccountWorkspace,
  db,
  saveRecord,
  workspace,
} from '../lib/db.js';
import { getPendingCount, pushChanges, sync } from '../lib/sync.js';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function resetDatabase() {
  await db.delete();
  await db.open();
}

test('team workspace mapping isolates local records when switching accounts', async () => {
  await resetDatabase();
  const first = await activateAccountWorkspace('CRS-FIRST', 'First Team');
  const player = await saveRecord(first.id, 'players', { name: 'Hussnain' });

  const second = await activateAccountWorkspace('CRS-SECOND', 'Second Team');
  assert.notEqual(second.id, first.id);
  assert.equal(await workspace().then((active) => active.id), second.id);
  assert.equal(await db.players.where({ workspaceId: second.id }).count(), 0);

  const restored = await activateAccountWorkspace('CRS-FIRST', 'First Team');
  assert.equal(restored.id, first.id);
  assert.equal(await db.players.get(player.id).then((record) => record.name), 'Hussnain');
  await db.delete();
});

test('sync pushes queued records and pulls remote records into the mapped workspace', async () => {
  await resetDatabase();
  const teamWorkspace = await activateAccountWorkspace('CRS-SYNC', 'Sync Team');
  await saveRecord(teamWorkspace.id, 'players', { name: 'Local player' });
  const remotePlayerId = crypto.randomUUID();

  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/auth/me')
      return response({ authenticated: true, teamId: 'CRS-SYNC', teamName: 'Sync Team' });
    if (url === '/api/sync/push') {
      const { changes } = JSON.parse(options.body);
      assert.equal(changes.length, 1);
      return response({
        applied: [
          {
            table: changes[0].table,
            recordId: changes[0].recordId,
            changeId: changes[0].changeId,
            revision: 1,
          },
        ],
        rejected: [],
        pushedAt: new Date().toISOString(),
      });
    }
    if (String(url).startsWith('/api/sync/pull')) {
      return response({
        pulledAt: new Date().toISOString(),
        records: [
          {
            table: 'players',
            recordId: remotePlayerId,
            data: { name: 'Remote player' },
            revision: 1,
            lastChangeId: 'remote-change',
            deletedAt: null,
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await sync(teamWorkspace.id);
    assert.equal(result.status, 'synced');
    assert.equal(await getPendingCount(teamWorkspace.id), 0);
    assert.equal(
      await db.players
        .where({ workspaceId: teamWorkspace.id })
        .filter((player) => player.name === 'Remote player')
        .count(),
      1,
    );
  } finally {
    globalThis.fetch = priorFetch;
    await db.delete();
  }
});

test('an edit made while its previous version is being pushed uses the acknowledged revision', async () => {
  await resetDatabase();
  const teamWorkspace = await activateAccountWorkspace('CRS-RACE', 'Race Team');
  const player = await saveRecord(teamWorkspace.id, 'players', { name: 'Before push' });
  const priorFetch = globalThis.fetch;
  let acknowledgedChangeId;
  globalThis.fetch = async (url, options = {}) => {
    if (url !== '/api/sync/push') throw new Error(`Unexpected request: ${url}`);
    const { changes } = JSON.parse(options.body);
    acknowledgedChangeId = changes[0].changeId;
    await saveRecord(teamWorkspace.id, 'players', { ...player, name: 'Edited during push' });
    return response({
      applied: [
        {
          table: changes[0].table,
          recordId: changes[0].recordId,
          changeId: changes[0].changeId,
          revision: 1,
        },
      ],
      rejected: [],
      pushedAt: new Date().toISOString(),
    });
  };

  try {
    const result = await pushChanges(teamWorkspace.id);
    assert.equal(result.pushed, 1);
    const pending = await db.pendingChanges.toArray();
    assert.equal(pending.length, 1);
    assert.notEqual(pending[0].changeId, acknowledgedChangeId);
    assert.equal(pending[0].baseRevision, 1);
    assert.equal(pending[0].data.name, 'Edited during push');
  } finally {
    globalThis.fetch = priorFetch;
    await db.delete();
  }
});
