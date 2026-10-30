/*
 * Read-only recovery preflight. It never writes to Atlas or IndexedDB.
 *
 * Usage:
 * npm run plan:match-recovery -- --mobile <backup.json> --team-id CRS-353209 --match-id <uuid>
 */
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { TeamAccount } from '../backend/models.js';
import { planMatchRecovery } from '../backend/matchRecovery.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Validated below.
  }
}

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const mobilePath = option('--mobile');
const requestedTeamId = option('--team-id');
const matchId = option('--match-id');
const verbose = args.includes('--verbose');
if (!process.env.MONGODB_URI)
  throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!mobilePath || !requestedTeamId || !matchId)
  throw new Error(
    'Use --mobile <backup> --team-id <team-id> --match-id <uuid>. No database query was made.',
  );

const backup = JSON.parse(await readFile(mobilePath, 'utf8'));
const history = {
  match: backup.matches?.find((record) => record.id === matchId),
  innings: (backup.innings || []).filter((record) => record.matchId === matchId),
  events: (backup.events || []).filter((record) => record.matchId === matchId),
};
const actionSummary = (actions) =>
  Object.fromEntries(
    ['create', 'restore', 'unchanged'].map((action) => [
      action,
      actions.filter((item) => item.action === action),
    ]),
  );
const publicActions = (items) =>
  items.map(({ table, recordId, action, baseRevision }) => ({
    table,
    recordId,
    action,
    baseRevision,
  }));
const compact = (items) => (verbose ? items : items.slice(0, 20));

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    bufferCommands: false,
    readPreference: 'primary',
    serverSelectionTimeoutMS: 10000,
  });
  const normalized = requestedTeamId.trim().toUpperCase();
  const account = await TeamAccount.findOne(
    { $or: [{ teamId: requestedTeamId }, { loginTeamId: normalized }] },
    { _id: 0, teamId: 1, loginTeamId: 1 },
  ).lean();
  if (!account)
    throw new Error('No account matches the supplied team ID. No recovery can be planned.');

  const records = await mongoose.connection.db
    .collection('syncRecords')
    .find(
      {
        teamId: account.teamId,
        $or: [{ table: 'matches', recordId: matchId }, { 'data.matchId': matchId }],
      },
      {
        projection: {
          _id: 0,
          table: 1,
          recordId: 1,
          data: 1,
          revision: 1,
          deletedAt: 1,
          updatedAt: 1,
        },
      },
    )
    .toArray();
  const playerIds = [
    ...new Set(
      history.match?.teams?.flatMap((team) => team.squad?.map((player) => player.id) || []) || [],
    ),
  ];
  const playerRecords = playerIds.length
    ? await mongoose.connection.db
        .collection('syncRecords')
        .find(
          { teamId: account.teamId, table: 'players', recordId: { $in: playerIds } },
          { projection: { _id: 0, recordId: 1, deletedAt: 1, revision: 1 } },
        )
        .toArray()
    : [];
  const plan = planMatchRecovery(history, records);
  const groups = actionSummary(plan.actions);
  console.log(
    JSON.stringify(
      {
        mode: 'read-only recovery preflight',
        queriedAt: new Date().toISOString(),
        account: {
          requestedTeamId,
          publicTeamId: account.loginTeamId || account.teamId,
          workspaceKey: account.teamId,
        },
        matchId,
        backup: {
          match: Boolean(history.match),
          innings: history.innings.length,
          events: history.events.length,
        },
        atlas: {
          matchingRecords: records.length,
          active: records.filter((record) => !record.deletedAt).length,
          tombstoned: records.filter((record) => record.deletedAt).length,
        },
        playerIdentityCheck: {
          referencedByFrozenMatchSquads: playerIds.length,
          active: playerRecords.filter((record) => !record.deletedAt).length,
          tombstoned: playerRecords.filter((record) => record.deletedAt).length,
          missing: playerIds.filter((id) => !playerRecords.some((record) => record.recordId === id))
            .length,
          action:
            'No player or membership record will be restored or overwritten; completed-match statistics use the frozen squad snapshots.',
        },
        replay: plan.validation.replay,
        validationErrors: plan.validation.errors,
        conflicts: plan.conflicts,
        recoveryFingerprint: plan.fingerprint,
        proposed: {
          creates: { count: groups.create.length, records: compact(publicActions(groups.create)) },
          restores: {
            count: groups.restore.length,
            records: compact(publicActions(groups.restore)),
          },
          unchanged: {
            count: groups.unchanged.length,
            records: compact(publicActions(groups.unchanged)),
          },
          recordsTruncated: !verbose && plan.actions.length > 60,
        },
        readyForOwnerApproval: plan.ready,
        note: 'No MongoDB document, tombstone, local IndexedDB record, or pending operation was changed.',
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
