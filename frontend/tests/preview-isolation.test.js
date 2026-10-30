import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProductionReadProbe,
  previewIsolationPassed,
  summarizePreviewAuthorization,
} from '../backend/previewIsolation.js';

test('Preview isolation distinguishes denied, empty-authorized, and failed production read probes', () => {
  assert.deepEqual(classifyProductionReadProbe({ error: { code: 13 } }), {
    outcome: 'authorization_denied',
    authorizationDenied: true,
    errorCode: 13,
  });
  assert.deepEqual(classifyProductionReadProbe({ result: { cursor: { firstBatch: [] } } }), {
    outcome: 'authorized_empty',
    authorizationDenied: false,
  });
  assert.deepEqual(classifyProductionReadProbe({ error: { code: 26 } }), {
    outcome: 'namespace_missing',
    authorizationDenied: false,
  });
  assert.deepEqual(
    classifyProductionReadProbe({
      error: { code: 8000, message: 'User is not allowed to do this operation.' },
    }),
    { outcome: 'authorization_denied', authorizationDenied: true, errorCode: 8000 },
  );
});

test('effective privileges, not only role labels, decide whether Preview can access production', () => {
  const summary = summarizePreviewAuthorization({
    authInfo: {
      authenticatedUsers: [{ user: 'crease_preview_user', db: 'admin' }],
      authenticatedUserRoles: [{ role: 'readWrite', db: 'crease_preview' }],
      authenticatedUserPrivileges: [
        { resource: { db: 'crease_preview', collection: '' }, actions: ['find', 'insert'] },
        { resource: { db: '', collection: '' }, actions: ['find'] },
      ],
    },
  });
  assert.equal(summary.authenticatedUsernameIsExpected, true);
  assert.equal(summary.productionFindPrivilegePresent, true);
  assert.equal(summary.productionWritePrivilegePresent, false);
  assert.deepEqual(summary.productionPrivilegeGrants, [{ scope: '*:*', actions: ['find'] }]);
  assert.equal(
    previewIsolationPassed({
      ...summary,
      uriUsesExpectedPreviewUser: true,
      uriUsesExpectedPreviewDatabase: true,
      sessionSecretConfigured: true,
      recoveryDisabled: true,
      productionDatabaseReadDenied: false,
      transactionsSupported: true,
    }),
    false,
  );
});
