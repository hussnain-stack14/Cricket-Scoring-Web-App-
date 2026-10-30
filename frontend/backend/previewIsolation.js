import { MongoClient } from 'mongodb';

const expectedUser = 'crease_preview_user';
const expectedDatabase = 'crease_preview';
const blockedDatabase = 'crease_scoring';
const knownProductionCollection = 'syncRecords';

function resourceCovers(resource = {}, database, collection) {
  if (resource.cluster === true) return true;
  const databaseMatches = resource.db === database || resource.db === '';
  const collectionMatches = resource.collection === collection || resource.collection === '';
  return databaseMatches && collectionMatches;
}

function safePrivilegeGrants(privileges, database, collection) {
  return (privileges || [])
    .filter((privilege) => resourceCovers(privilege.resource, database, collection))
    .map((privilege) => ({
      scope: privilege.resource?.cluster
        ? 'cluster'
        : `${privilege.resource?.db || '*'}:${privilege.resource?.collection || '*'}`,
      actions: [...(privilege.actions || [])].sort(),
    }));
}

export function summarizePreviewAuthorization(status) {
  const authInfo = status.authInfo || {};
  const users = authInfo.authenticatedUsers || [];
  const roles = authInfo.authenticatedUserRoles || [];
  const privileges = authInfo.authenticatedUserPrivileges;
  const productionGrants = safePrivilegeGrants(
    privileges,
    blockedDatabase,
    knownProductionCollection,
  );
  const actions = new Set(productionGrants.flatMap((grant) => grant.actions));
  return {
    authenticatedUsernameIsExpected: users.some((user) => user.user === expectedUser),
    authenticatedUserCount: users.length,
    effectiveRoles: roles.map((role) => `${role.role}@${role.db}`).sort(),
    effectivePrivilegesAvailable: Array.isArray(privileges),
    previewReadWriteRolePresent: roles.some(
      (role) => role.role === 'readWrite' && role.db === expectedDatabase,
    ),
    productionRolePresent: roles.some((role) => role.db === blockedDatabase || role.db === 'admin'),
    productionFindPrivilegePresent: actions.has('find') || actions.has('anyAction'),
    productionWritePrivilegePresent: ['insert', 'update', 'remove', 'anyAction'].some((action) =>
      actions.has(action),
    ),
    productionPrivilegeGrants: productionGrants,
  };
}

export function classifyProductionReadProbe({ result, error }) {
  if (result) {
    const batch = result.cursor?.firstBatch;
    return {
      outcome: Array.isArray(batch) && batch.length ? 'authorized_nonempty' : 'authorized_empty',
      authorizationDenied: false,
    };
  }
  const message = String(error?.message || '');
  const authorizationMessage =
    /not authorized|unauthorized|not allowed|insufficient privileges|requires authentication/i.test(
      message,
    );
  if (error?.code === 13 || authorizationMessage)
    return {
      outcome: 'authorization_denied',
      authorizationDenied: true,
      ...(error?.code !== undefined ? { errorCode: error.code } : {}),
    };
  if (error?.code === 26) return { outcome: 'namespace_missing', authorizationDenied: false };
  return {
    outcome: 'probe_error',
    authorizationDenied: false,
    errorCode: typeof error?.code === 'number' ? error.code : error?.name || 'unknown',
    authorizationMessageDetected: authorizationMessage,
  };
}

export async function checkPreviewIsolation(environment = process.env) {
  const uri = environment.MONGODB_URI;
  if (!uri) throw new Error('Preview MONGODB_URI is not configured.');
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Preview MONGODB_URI is invalid.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(parsed.username);
  const result = {
    mode: 'read-only Preview isolation diagnostic',
    uriUsesExpectedPreviewUser: username === expectedUser,
    uriUsesExpectedPreviewDatabase: database === expectedDatabase,
    sessionSecretConfigured:
      typeof environment.SESSION_SECRET === 'string' && environment.SESSION_SECRET.length >= 32,
    recoveryDisabled: environment.MATCH_RECOVERY_ENABLED === 'false',
    productionDatabaseReadDenied: null,
    productionDatabaseProbe: null,
    previewReadWriteRolePresent: false,
    productionRolePresent: null,
    authenticatedUsernameIsExpected: false,
    effectivePrivilegesAvailable: false,
    productionFindPrivilegePresent: null,
    productionWritePrivilegePresent: null,
    productionPrivilegeGrants: [],
    effectiveRoles: [],
    transactionsSupported: false,
  };
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const status = await client
      .db(expectedDatabase)
      .command({ connectionStatus: 1, showPrivileges: true });
    const authorization = summarizePreviewAuthorization(status);
    Object.assign(result, authorization);
    try {
      // A known production collection is queried with an impossible _id. No record data is read.
      const probe = await client.db(blockedDatabase).command({
        find: knownProductionCollection,
        filter: { _id: '__crease_preview_authorization_probe__' },
        limit: 1,
        batchSize: 1,
      });
      result.productionDatabaseProbe = classifyProductionReadProbe({ result: probe });
    } catch (error) {
      result.productionDatabaseProbe = classifyProductionReadProbe({ error });
    }
    result.productionDatabaseReadDenied = result.productionDatabaseProbe.authorizationDenied;
    const hello = await client.db('admin').command({ hello: 1 });
    result.transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } finally {
    await client.close();
  }
  return result;
}

export function previewIsolationPassed(result) {
  return Boolean(
    result.uriUsesExpectedPreviewUser &&
    result.uriUsesExpectedPreviewDatabase &&
    result.sessionSecretConfigured &&
    result.recoveryDisabled &&
    result.previewReadWriteRolePresent &&
    result.authenticatedUsernameIsExpected &&
    result.effectivePrivilegesAvailable &&
    !result.productionRolePresent &&
    result.productionDatabaseReadDenied &&
    !result.productionFindPrivilegePresent &&
    !result.productionWritePrivilegePresent &&
    result.transactionsSupported,
  );
}
