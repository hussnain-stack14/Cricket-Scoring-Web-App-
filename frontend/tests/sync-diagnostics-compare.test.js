import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDiagnostics } from '../scripts/compare-sync-diagnostics.mjs';

const operation = (fingerprint, overrides = {}) => ({
  recordFingerprint: fingerprint,
  recordType: 'events',
  operationType: 'create',
  status: 'pending',
  baseRevision: 0,
  queuedAt: '2026-10-30T12:00:00.000Z',
  ...overrides,
});

test('read-only diagnostics comparison identifies account mismatch, unique work, conflicts, and stuck uploads', () => {
  const first = {
    diagnosticSchema: 2,
    accountKey: 'CRS-353209',
    workspaceId: 'device-a',
    pending: 2,
    pendingByType: { events: 2 },
    queueWindow: {},
    upload: { lastAttempt: '2026-10-30T12:00:00.000Z', lastHttpStatus: 504 },
    cursor: {},
    lastError: 'Request timed out after 45000 ms.',
    conflicts: [{ table: 'events', recordFingerprint: 'event-conflict' }],
    operations: [operation('shared'), operation('only-a', { status: 'conflict' })],
  };
  const second = {
    diagnosticSchema: 2,
    accountKey: 'different-account',
    workspaceId: 'device-b',
    pending: 2,
    pendingByType: { events: 2 },
    queueWindow: {},
    upload: { lastAttempt: '2026-10-30T12:01:00.000Z', lastHttpStatus: 200 },
    cursor: {},
    conflicts: [],
    operations: [
      operation('shared', { baseRevision: 3 }),
      operation('only-b', { operationType: 'delete' }),
    ],
  };
  const result = compareDiagnostics(first, second);
  assert.equal(result.accountIdentity.matches, false);
  assert.equal(result.pendingOperations.shared, 1);
  assert.equal(result.pendingOperations.uniqueToFirst[0].fingerprint, 'only-a');
  assert.equal(result.pendingOperations.uniqueToSecond[0].fingerprint, 'only-b');
  assert.equal(result.pendingOperations.revisionOrStatusDisagreements.length, 1);
  assert.equal(result.blockedOperations.first.length, 1);
  assert.equal(result.tombstones.second.length, 1);
  assert.equal(result.stuckUploadSignals.first.httpStatus, 504);
});

test('comparison warns when an older diagnostic cannot safely compare pending record fingerprints', () => {
  const legacy = { accountKey: 'one', pending: 0, operations: [] };
  const current = { diagnosticSchema: 2, accountKey: 'one', pending: 0, operations: [] };
  const result = compareDiagnostics(legacy, current);
  assert.equal(result.comparable, false);
  assert.match(result.notes[0], /predates schema 2/);
});
