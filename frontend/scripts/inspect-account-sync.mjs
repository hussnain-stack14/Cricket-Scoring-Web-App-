/*
 * Read-only Atlas/account vs Crease v2 backup diagnostic.
 * It never writes to MongoDB and never prints credentials or record payloads.
 *
 * Usage:
 * npm run inspect:account-sync -- --account-id CRS-353209 --backup <backup.json>
 */
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { TeamAccount } from '../backend/models.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Configuration is validated below.
  }
}

const TABLES = [
  'players',
  'teams',
  'memberships',
  'matches',
  'innings',
  'events',
  'audits',
  'drafts',
];
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const accountId = option('--account-id');
const backupPath = option('--backup');
const verbose = args.includes('--verbose');
if (!process.env.MONGODB_URI)
  throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!accountId || !backupPath)
  throw new Error(
    'Use --account-id <login-team-id> --backup <backup.json>. No database query was made.',
  );

const backup = JSON.parse(await readFile(backupPath, 'utf8'));
if (backup?.app !== 'crease' || backup?.version !== 2)
  throw new Error('Expected a valid Crease v2 backup. No database query was made.');

const countByTable = (records, predicate = () => true) =>
  Object.fromEntries(
    TABLES.map((table) => [
      table,
      records.filter((row) => row.table === table && predicate(row)).length,
    ]),
  );
const listByTable = (records, predicate = () => true) =>
  Object.fromEntries(
    TABLES.map((table) => [
      table,
      records
        .filter((row) => row.table === table && predicate(row))
        .map((row) => row.recordId)
        .sort(),
    ]),
  );
const backupIds = Object.fromEntries(
  TABLES.map((table) => [table, new Set((backup[table] || []).map((row) => row.id))]),
);
const summarizeIds = (ids) => ({
  count: ids.length,
  ids: verbose ? ids : ids.slice(0, 10),
  truncated: !verbose && ids.length > 10,
});

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    bufferCommands: false,
    readPreference: 'primary',
    serverSelectionTimeoutMS: 10000,
  });
  const normalizedAccountId = accountId.trim().toUpperCase();
  const account = await TeamAccount.findOne(
    { $or: [{ teamId: accountId }, { loginTeamId: normalizedAccountId }] },
    { _id: 0, teamId: 1, loginTeamId: 1, name: 1, authVersion: 1 },
  ).lean();
  if (!account) throw new Error('No account matches the supplied login/team ID.');

  const records = await mongoose.connection.db
    .collection('syncRecords')
    .find(
      { teamId: account.teamId },
      {
        projection: {
          _id: 0,
          teamId: 1,
          table: 1,
          recordId: 1,
          revision: 1,
          deletedAt: 1,
          updatedAt: 1,
          'data.matchId': 1,
          'data.status': 1,
        },
      },
    )
    .toArray();
  const active = records.filter((row) => !row.deletedAt);
  const deleted = records.filter((row) => row.deletedAt);
  const activeIds = Object.fromEntries(
    TABLES.map((table) => [
      table,
      new Set(active.filter((row) => row.table === table).map((row) => row.recordId)),
    ]),
  );
  const deletedIds = Object.fromEntries(
    TABLES.map((table) => [
      table,
      new Set(deleted.filter((row) => row.table === table).map((row) => row.recordId)),
    ]),
  );
  const comparison = Object.fromEntries(
    TABLES.map((table) => {
      const local = backupIds[table];
      const cloud = activeIds[table];
      const tombstones = deletedIds[table];
      return [
        table,
        {
          backup: local.size,
          atlasActive: cloud.size,
          atlasDeleted: tombstones.size,
          sharedActive: [...local].filter((id) => cloud.has(id)).length,
          backupOnly: summarizeIds(
            [...local].filter((id) => !cloud.has(id) && !tombstones.has(id)).sort(),
          ),
          backupIdsTombstonedInAtlas: summarizeIds(
            [...local].filter((id) => tombstones.has(id)).sort(),
          ),
          atlasOnlyActive: summarizeIds([...cloud].filter((id) => !local.has(id)).sort()),
        },
      ];
    }),
  );

  const activeMatchIds = activeIds.matches;
  const activeChildrenOfDeletedMatches = active
    .filter((row) => ['innings', 'events', 'audits'].includes(row.table) && row.data?.matchId)
    .filter((row) => !activeMatchIds.has(row.data.matchId))
    .map((row) => ({ table: row.table, recordId: row.recordId, matchId: row.data.matchId }));
  const visibleOnFreshBrowser = {
    players: activeIds.players.size,
    teams: activeIds.teams.size,
    memberships: activeIds.memberships.size,
    matches: activeIds.matches.size,
    innings: active.filter(
      (row) => row.table === 'innings' && activeMatchIds.has(row.data?.matchId),
    ).length,
    events: active.filter((row) => row.table === 'events' && activeMatchIds.has(row.data?.matchId))
      .length,
    audits: active.filter((row) => row.table === 'audits' && activeMatchIds.has(row.data?.matchId))
      .length,
    drafts: activeIds.drafts.size,
  };

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        queriedAt: new Date().toISOString(),
        requestedAccountId: accountId,
        account: {
          loginTeamId: account.loginTeamId || account.teamId,
          cloudScopeKey: account.teamId,
          requestedIdMatchesCloudScope: account.teamId === accountId,
          authVersion: account.authVersion ?? 0,
        },
        atlas: {
          activeCounts: countByTable(active),
          deletedCounts: countByTable(deleted),
          deletedRecordIds: verbose ? listByTable(deleted) : undefined,
          visibleOnFreshBrowser,
          activeChildrenOfDeletedMatches: {
            count: activeChildrenOfDeletedMatches.length,
            records: verbose
              ? activeChildrenOfDeletedMatches
              : activeChildrenOfDeletedMatches.slice(0, 10),
            truncated: !verbose && activeChildrenOfDeletedMatches.length > 10,
          },
        },
        backup: {
          workspaceId: backup.workspace?.id || null,
          counts: Object.fromEntries(TABLES.map((table) => [table, (backup[table] || []).length])),
        },
        comparison,
        note: 'The query used the authenticated account model to resolve the stable cloud partition. No MongoDB document was changed.',
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
