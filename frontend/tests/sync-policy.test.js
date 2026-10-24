import test from 'node:test';
import assert from 'node:assert/strict';
import { syncPolicyError } from '../backend/syncPolicy.js';
test('server deletion policy requires ownership, protects archives and rejects resurrection', () => {
  for (const table of ['matches', 'players', 'teams', 'drafts', 'memberships']) {
    const change = { table, deleted: true, data: {} };
    assert.match(syncPolicyError(change, null, 'scorer'), /owner/);
    assert.equal(syncPolicyError(change, null, 'owner'), null);
    assert.match(syncPolicyError(change, null, 'viewer'), /Viewers/);
  }
  assert.match(
    syncPolicyError(
      { table: 'players', deleted: false, data: { archived: true } },
      { data: {} },
      'scorer',
    ),
    /archive/,
  );
  assert.equal(
    syncPolicyError(
      { table: 'players', deleted: false, data: { archived: true } },
      { data: {} },
      'owner',
    ),
    null,
  );
  assert.match(
    syncPolicyError(
      { table: 'matches', deleted: false, data: {} },
      { deletedAt: new Date() },
      'owner',
    ),
    /stale/,
  );
  assert.match(
    syncPolicyError(
      { table: 'matches', deleted: false, data: { deletedAt: 'today' } },
      null,
      'scorer',
    ),
    /tombstone/,
  );
});
