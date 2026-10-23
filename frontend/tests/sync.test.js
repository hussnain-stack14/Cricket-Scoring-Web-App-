import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateAccountWorkspace,
  db,
  clearAccountWorkspace,
  saveRecord,
  createWorkspace,
  getActiveCachedAccountSession,
  invalidateCachedAccountSession,
  workspace,
} from '../lib/db.js';
import {
  beginSignOut,
  cancelSignOut,
  fetchSession,
  getPendingCount,
  pushChanges,
  sync,
} from '../lib/sync.js';

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

test('temporary session network failures restore the active authorized workspace offline', async () => {
  await resetDatabase();
  const accountWorkspace = await activateAccountWorkspace('internal-account-key', 'Royal Club', {
    publicTeamId: 'RoyalClub202',
    teamName: 'Royal Club',
    role: 'owner',
  });
  const player = await saveRecord(accountWorkspace.id, 'players', { name: 'Offline player' });
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Network unavailable');
  };

  try {
    const cachedSession = await getActiveCachedAccountSession();
    assert.equal(cachedSession.offlineCached, true);
    assert.equal(cachedSession.teamId, 'RoyalClub202');
    assert.equal(cachedSession.workspaceKey, 'internal-account-key');
    assert.equal((await workspace()).id, accountWorkspace.id);
    assert.equal((await db.players.get(player.id)).name, 'Offline player');
    await assert.rejects(fetchSession(), /Network unavailable/);
    const sameAccount = await activateAccountWorkspace('internal-account-key', 'Royal Club', {
      publicTeamId: 'royal-club',
      teamName: 'Royal Club',
      role: 'owner',
    });
    assert.equal(sameAccount.id, accountWorkspace.id);
    assert.equal((await db.players.get(player.id)).name, 'Offline player');
    assert.equal((await getActiveCachedAccountSession()).teamId, 'royal-club');
  } finally {
    globalThis.fetch = priorFetch;
    await db.delete();
  }
});

test('session timeouts are distinct from invalid sessions and preserve cached records', async () => {
  await resetDatabase();
  const teamWorkspace = await activateAccountWorkspace('timeout-account', 'Timeout Team');
  const player = await saveRecord(teamWorkspace.id, 'players', { name: 'Saved player' });
  const priorFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
    );

  try {
    await assert.rejects(fetchSession({ timeoutMs: 5 }), (error) => error.name === 'TimeoutError');
    assert.equal((await getActiveCachedAccountSession()).workspaceKey, 'timeout-account');
    assert.equal((await db.players.get(player.id)).name, 'Saved player');
    await invalidateCachedAccountSession(teamWorkspace.id);
    assert.equal(await getActiveCachedAccountSession(), null);
    assert.equal((await db.players.get(player.id)).name, 'Saved player');
    assert.equal(await getPendingCount(teamWorkspace.id), 1);
  } finally {
    globalThis.fetch = priorFetch;
    await db.delete();
  }
});

test('concurrent session checks share one bounded auth request', async () => {
  const priorFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return response({ authenticated: false }, 401);
  };

  try {
    const results = await Promise.all([fetchSession(), fetchSession()]);
    assert.deepEqual(results, [null, null]);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test('sync network failure preserves the active account and pending changes', async () => {
  await resetDatabase();
  const teamWorkspace = await activateAccountWorkspace('network-account', 'Network Team');
  const player = await saveRecord(teamWorkspace.id, 'players', { name: 'Pending player' });
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Network unavailable');
  };

  try {
    const result = await sync(teamWorkspace.id);
    assert.equal(result.reason, 'network');
    assert.equal((await getActiveCachedAccountSession()).workspaceKey, 'network-account');
    assert.equal((await db.players.get(player.id)).name, 'Pending player');
    assert.equal(await getPendingCount(teamWorkspace.id), 1);
  } finally {
    globalThis.fetch = priorFetch;
    await db.delete();
  }
});

test('sign-out write lock prevents new local edits and cleanup is account scoped', async () => {
  await resetDatabase();
  const first = await activateAccountWorkspace('account-one', 'First team');
  const firstPlayer = await saveRecord(first.id, 'players', { name: 'First player' });
  const second = await activateAccountWorkspace('account-two', 'Second team');
  const secondPlayer = await saveRecord(second.id, 'players', { name: 'Second player' });
  const guest = await createWorkspace('Guest workspace');
  const guestPlayer = await saveRecord(guest.id, 'players', { name: 'Guest player' });
  await db.syncMeta.update(first.id, {
    syncLock: { id: 'in-progress', expiresAt: Date.now() + 60_000 },
  });
  await assert.rejects(beginSignOut(first.id), /Synchronization is still running/);
  await db.syncMeta.update(first.id, { syncLock: null });
  let token = await beginSignOut(first.id);

  try {
    await assert.rejects(
      saveRecord(first.id, 'players', { ...firstPlayer, name: 'Edit during sign out' }),
      /Sign out is in progress/,
    );
    await db.pendingChanges.where({ workspaceId: first.id }).delete();
    await db.syncMeta.update(first.id, { syncStatus: 'attention', lastError: 'pull failed' });
    await cancelSignOut(first.id, token);
    assert.equal((await db.syncMeta.get(first.id)).syncStatus, 'attention');
    token = await beginSignOut(first.id);
    await clearAccountWorkspace(first.id, token);
    await clearAccountWorkspace(first.id, token);
    assert.equal(await db.workspaces.get(first.id), undefined);
    assert.equal(await db.players.get(firstPlayer.id), undefined);
    assert.equal((await db.players.get(secondPlayer.id)).name, 'Second player');
    assert.equal((await db.players.get(guestPlayer.id)).name, 'Guest player');
    assert.equal(await getPendingCount(first.id), 0);
  } finally {
    await db.delete();
  }
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
