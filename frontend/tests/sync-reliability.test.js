import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  activateAccountWorkspace,
  saveRecord,
  clearAccountWorkspace,
  all,
  exportBackup,
  saveTeam,
  createMatch,
} from '../lib/db.js';
import {
  sync,
  pushChanges,
  pullChanges,
  beginSignOut,
  cancelSignOut,
  getPendingCount,
} from '../lib/sync.js';
import { inspectSync } from '../lib/syncDiagnostics.js';
import { isConsumedDraft, syncPolicyError } from '../backend/syncPolicy.js';
async function setup() {
  await db.delete();
  await db.open();
  const w = await activateAccountWorkspace('original-account', 'Scorer', { role: 'scorer' });
  await saveRecord(w.id, 'players', { name: 'Saved player' });
  return w;
}
const session = {
  authenticated: true,
  teamId: 'Public ID',
  workspaceKey: 'original-account',
  role: 'scorer',
};

test('retry after a lost response preserves changes, uses stable operation IDs and clears only acknowledged records', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  let attempts = 0,
    ids = [];
  try {
    globalThis.fetch = async (url, options) => {
      if (url === '/api/auth/me') return Response.json(session);
      if (url.includes('/push')) {
        const changes = JSON.parse(options.body).changes;
        ids.push(changes[0].changeId);
        assert.equal(options.headers['X-Crease-Workspace'], 'original-account');
        if (!attempts++) throw new TypeError('Failed to fetch');
        return Response.json({
          applied: changes.map((c) => ({ ...c, revision: 1 })),
          rejected: [],
        });
      }
      return Response.json({ records: [], pulledAt: new Date().toISOString() });
    };
    const first = await sync(w.id);
    assert.equal(first.ok, false);
    assert.equal(await getPendingCount(w.id), 1);
    const [a, b] = await Promise.all([sync(w.id), sync(w.id)]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    assert.equal(await getPendingCount(w.id), 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('sync retry recovers from session endpoint 500 without changing pending operations', async () => {
  const w = await setup();
  const original = globalThis.fetch;
  let sessionChecks = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (url === '/api/auth/me') {
        if (!sessionChecks++)
          return Response.json({ error: 'MongoDB is not configured.' }, { status: 503 });
        return Response.json(session);
      }
      if (url.includes('/push')) {
        const changes = JSON.parse(options.body).changes;
        return Response.json({
          applied: changes.map((change) => ({ ...change, revision: 1 })),
          rejected: [],
        });
      }
      return Response.json({ records: [], pulledAt: new Date().toISOString() });
    };

    const failed = await sync(w.id);
    assert.equal(failed.status, 'attention');
    assert.match(failed.error, /MongoDB/);
    assert.equal(await getPendingCount(w.id), 1);

    const retried = await sync(w.id);
    assert.equal(retried.status, 'synced');
    assert.equal(await getPendingCount(w.id), 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('rejections without server records retain their reason, pending operations, and zero-match diagnostic context', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) =>
      url === '/api/auth/me'
        ? Response.json(session)
        : url.includes('/push')
          ? Response.json({
              applied: [],
              rejected: JSON.parse(options.body).changes.map((c) => ({
                ...c,
                reason: 'Owner approval required',
                serverRecord: null,
              })),
            })
          : Response.json({ records: [], pulledAt: new Date().toISOString() });
    const result = await sync(w.id);
    assert.equal(result.status, 'conflict');
    assert.match(result.error, /Owner/);
    const report = await inspectSync(w.id);
    assert.equal(report.pending, 1);
    assert.equal(report.counts.matches.visible, 0);
    assert.equal(report.operations[0].duplicate, false);
    assert.equal(report.operations[0].operationType, 'create');
    assert.equal(report.operations[0].recordType, 'players');
    assert.equal(report.operations[0].status, 'rejected');
    assert.equal(report.operations[0].accountKey, 'original-account');
    assert.equal('recordId' in report.operations[0], false);
    assert.equal(report.rejections[0].reason, 'Owner approval required');
    assert.equal(report.activeAccountMatches, true);
    assert.equal((await all(w.id)).matches.length, 0);
    assert.equal((await exportBackup(await db.workspaces.get(w.id))).players.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('diagnostic failure messages redact credentials and operation content is never exported', async () => {
  const w = await setup();
  const change = await db.pendingChanges.toCollection().first();
  await db.syncMeta.update(w.id, {
    lastError: 'Authorization: Bearer abc123 password=secret-value',
    rejections: [
      {
        table: change.table,
        recordId: change.recordId,
        reason: 'token=secret-value rejected',
      },
    ],
  });
  const report = await inspectSync(w.id);
  assert.equal(report.pending, 1);
  assert.doesNotMatch(JSON.stringify(report), /abc123|secret-value/);
  assert.equal(report.operations[0].failureReason, 'token=[redacted] rejected');
  assert.equal('data' in report.operations[0], false);
});
test('session expiration and account switching preserve queued data and cleanup rejects unsynced records', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) =>
      url === '/api/auth/me'
        ? Response.json(session)
        : Response.json({ error: 'Session expired' }, { status: 401 });
    assert.equal((await sync(w.id)).status, 'unauthenticated');
    assert.equal(await getPendingCount(w.id), 1);
    globalThis.fetch = async () => Response.json({ ...session, workspaceKey: 'another-account' });
    assert.equal((await sync(w.id)).status, 'unauthenticated');
    const token = await beginSignOut(w.id);
    await assert.rejects(clearAccountWorkspace(w.id, token), /Unsynced/);
    assert.equal((await all(w.id)).players.length, 1);
    await cancelSignOut(w.id, token);
  } finally {
    globalThis.fetch = original;
  }
});
test('an acknowledgment for another table cannot remove an operation', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) =>
      Response.json({
        applied: JSON.parse(options.body).changes.map((c) => ({
          ...c,
          table: 'teams',
          revision: 1,
        })),
        rejected: [],
      });
    await pushChanges(w.id);
    assert.equal(await getPendingCount(w.id), 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('large queues upload in acknowledged batches without dropping operations', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  for (let index = 1; index < 301; index++)
    await saveRecord(w.id, 'players', { name: `Queued player ${index}` });
  const batchSizes = [];
  try {
    globalThis.fetch = async (url, options) => {
      if (url === '/api/auth/me') return Response.json(session);
      if (url.includes('/push')) {
        const changes = JSON.parse(options.body).changes;
        batchSizes.push(changes.length);
        return Response.json({
          applied: changes.map((change) => ({
            table: change.table,
            recordId: change.recordId,
            changeId: change.changeId,
            revision: change.baseRevision + 1,
          })),
          rejected: [],
          pushedAt: new Date().toISOString(),
        });
      }
      return Response.json({ records: [], pulledAt: new Date().toISOString() });
    };
    const result = await sync(w.id);
    assert.equal(result.ok, true);
    assert.deepEqual(batchSizes, [250, 51]);
    assert.equal(await getPendingCount(w.id), 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('pull pagination applies one stable snapshot and advances only after the final page', async () => {
  const w = await setup(),
    original = globalThis.fetch;
  await db.pendingChanges.clear();
  const pulledAt = '2026-10-26T12:00:00.000Z';
  let requests = 0;
  try {
    globalThis.fetch = async (url) => {
      requests++;
      const parsed = new URL(url, 'https://crease.test');
      if (requests === 1) {
        assert.equal(parsed.searchParams.has('until'), false);
        return Response.json({
          records: [
            {
              table: 'players',
              recordId: 'remote-one',
              data: { id: 'remote-one', name: 'Remote one' },
              revision: 1,
            },
          ],
          pulledAt,
          until: pulledAt,
          hasMore: true,
          nextCursor: {
            updatedAt: '2026-10-26T11:59:00.000Z',
            table: 'players',
            recordId: 'remote-one',
          },
        });
      }
      assert.equal(parsed.searchParams.get('until'), pulledAt);
      assert.equal(parsed.searchParams.get('afterRecordId'), 'remote-one');
      return Response.json({
        records: [
          {
            table: 'players',
            recordId: 'remote-two',
            data: { id: 'remote-two', name: 'Remote two' },
            revision: 1,
          },
        ],
        pulledAt,
        until: pulledAt,
        hasMore: false,
        nextCursor: null,
      });
    };
    const result = await pullChanges(w.id);
    assert.equal(result.merged, 2);
    assert.equal(requests, 2);
    assert.equal((await db.syncMeta.get(w.id)).lastPull, pulledAt);
    assert.equal((await db.players.get('remote-one')).workspaceId, w.id);
    assert.equal((await db.players.get('remote-two')).workspaceId, w.id);
  } finally {
    globalThis.fetch = original;
  }
});
test('a completed parent waits for its full child snapshot and then becomes final on the next pull', async () => {
  const w = await setup();
  await db.pendingChanges.clear();
  const original = globalThis.fetch;
  const completed = {
    id: 'server-match',
    workspaceId: w.id,
    status: 'completed',
    revision: 4,
    startId: 'start',
    teams: [],
    rules: {},
    syncSnapshot: { innings: 2, events: 2 },
  };
  const records = [
    { table: 'matches', recordId: 'server-match', data: completed, revision: 4 },
    {
      table: 'innings',
      recordId: 'inn-1',
      data: { id: 'inn-1', workspaceId: w.id, matchId: 'server-match', startId: 'start' },
      revision: 1,
    },
    {
      table: 'events',
      recordId: 'event-1',
      data: { id: 'event-1', workspaceId: w.id, matchId: 'server-match', startId: 'start' },
      revision: 1,
    },
  ];
  try {
    globalThis.fetch = async () => Response.json({ records, pulledAt: new Date().toISOString() });
    await pullChanges(w.id);
    assert.equal((await db.matches.get('server-match')).status, 'live');
    assert.equal(await db.events.where({ workspaceId: w.id }).count(), 1);
    records.push(
      {
        table: 'innings',
        recordId: 'inn-2',
        data: { id: 'inn-2', workspaceId: w.id, matchId: 'server-match', startId: 'start' },
        revision: 1,
      },
      {
        table: 'events',
        recordId: 'event-2',
        data: { id: 'event-2', workspaceId: w.id, matchId: 'server-match', startId: 'start' },
        revision: 1,
      },
    );
    await pullChanges(w.id);
    assert.equal((await db.matches.get('server-match')).status, 'completed');
  } finally {
    globalThis.fetch = original;
  }
});
test('scorer draft consumption is linked to a match and only a verified consumption bypasses owner deletion policy', async () => {
  const w = await setup();
  const a = await saveRecord(w.id, 'teams', { name: 'A' }),
    b = await saveRecord(w.id, 'teams', { name: 'B' });
  const draft = await saveRecord(w.id, 'drafts', {
    teamA: a.id,
    teamB: b.id,
    squadA: [],
    squadB: [],
    rules: w.rules,
    step: 1,
    date: '2026-01-01',
  });
  const m = await createMatch(
    w.id,
    {
      teams: [
        { ...a, squad: [] },
        { ...b, squad: [] },
      ],
      rules: w.rules,
      date: '2026-01-01',
      firstBat: 0,
    },
    undefined,
    draft.id,
  );
  const change = (await db.pendingChanges.toArray()).find((c) => c.table === 'drafts');
  assert.equal(change.data.consumedByMatchId, m.id);
  assert.equal(m.sourceDraftId, draft.id);
  assert.match(syncPolicyError(change, null, 'scorer'), /owner/);
  const matchingMatch = {
    data: { sourceDraftId: draft.id, teams: [{ id: a.id }, { id: b.id }] },
  };
  assert.equal(isConsumedDraft(change, matchingMatch, null), true);
  assert.equal(
    isConsumedDraft(change, { data: { teams: [{ id: a.id }, { id: b.id }] } }, null),
    false,
  );
  assert.equal(
    isConsumedDraft(change, matchingMatch, { data: { teamA: b.id, teamB: a.id } }),
    false,
  );
  assert.equal(syncPolicyError(change, null, 'scorer', { consumedDraft: true }), null);
  assert.match(syncPolicyError(change, null, 'scorer', { consumedDraft: false }), /owner/);
});
