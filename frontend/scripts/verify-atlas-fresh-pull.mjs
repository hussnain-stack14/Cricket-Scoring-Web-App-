/*
 * Read-only Atlas -> in-memory IndexedDB compatibility check.
 * Production records are queried but never printed or changed.
 */
import 'fake-indexeddb/auto';
import mongoose from 'mongoose';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Validated below.
  }
}

const accountId = process.argv[process.argv.indexOf('--account-id') + 1];
if (!process.env.MONGODB_URI)
  throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!accountId) throw new Error('Use --account-id <team-id>. No database query was made.');

const { TeamAccount } = await import('../backend/models.js');
const { db, activateAccountWorkspace, all } = await import('../lib/db.js');
const { pullChanges } = await import('../lib/sync.js');

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    bufferCommands: false,
    readPreference: 'primary',
    serverSelectionTimeoutMS: 10000,
  });
  const normalized = accountId.trim().toUpperCase();
  const account = await TeamAccount.findOne({
    $or: [{ teamId: accountId }, { loginTeamId: normalized }],
  }).lean();
  if (!account) throw new Error('No account matches the supplied ID.');

  const records = await mongoose.connection.db
    .collection('syncRecords')
    .find({ teamId: account.teamId }, { projection: { _id: 0, __v: 0, teamId: 0 } })
    .sort({ updatedAt: 1, table: 1, recordId: 1 })
    .toArray();
  const pulledAt = new Date().toISOString();
  globalThis.fetch = async (url) => {
    if (!String(url).startsWith('/api/sync/pull?'))
      return Response.json({ error: 'Unexpected diagnostic request.' }, { status: 500 });
    return Response.json({ records, pulledAt, until: pulledAt, hasMore: false, nextCursor: null });
  };

  const workspace = await activateAccountWorkspace(account.teamId, account.name, {
    teamId: account.loginTeamId || account.teamId,
    workspaceKey: account.teamId,
    teamName: account.name,
    role: 'owner',
  });
  const result = await pullChanges(workspace.id);
  const local = await all(workspace.id);
  console.log(
    JSON.stringify(
      {
        mode: 'read-only Atlas; in-memory IndexedDB',
        atlasRecords: records.length,
        pullResult: result,
        localCounts: Object.fromEntries(
          [
            'players',
            'teams',
            'memberships',
            'matches',
            'innings',
            'events',
            'audits',
            'drafts',
          ].map((table) => [table, local[table].length]),
        ),
        note: 'No production document or on-device IndexedDB database was modified.',
      },
      null,
      2,
    ),
  );
} finally {
  await db.delete();
  await mongoose.disconnect();
}
