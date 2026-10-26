/*
 * Read-only recovery planner for an event-history repair.
 * It compares a verified local backup with the active Atlas records and never writes data.
 *
 * Usage:
 * npm run plan:match-recovery -- --mobile <backup.json> --team-id CRS-353209 --match-id <uuid>
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { matchStates, overs, result } from '../lib/engine.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env.local'); } catch { /* validated below */ }
}

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const mobilePath = option('--mobile');
const teamId = option('--team-id');
const matchId = option('--match-id');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!mobilePath || !teamId || !matchId)
  throw new Error('Use --mobile <backup> --team-id <team-id> --match-id <match-id>. No database query was made.');

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const accountShape = (record) => {
  const copy = structuredClone(record);
  delete copy.workspaceId;
  return copy;
};
const fingerprint = (record) => createHash('sha256').update(JSON.stringify(stable(accountShape(record)))).digest('hex');
const history = (backup) => ({
  match: backup.matches?.find((record) => record.id === matchId),
  innings: (backup.innings || []).filter((record) => record.matchId === matchId),
  events: (backup.events || []).filter((record) => record.matchId === matchId),
});
const replay = (source) => {
  const states = matchStates(source.match, source.innings, source.events);
  return {
    innings: states.map((state, index) => ({
      number: index + 1,
      runs: state.runs,
      wickets: state.wickets,
      overs: overs(state.balls),
      completed: Boolean(state.done),
      extras: state.extras,
    })),
    result: result(source.match, states),
  };
};
const distinct = (values) => [...new Set(values)];

const backup = JSON.parse(await readFile(mobilePath, 'utf8'));
const local = history(backup);
if (!local.match || local.innings.length !== 2 || !local.events.length)
  throw new Error('The backup does not contain a complete two-innings history for this match. No database query was made.');

try {
  // Primary prevents a stale secondary from producing an unsafe recovery plan.
  await mongoose.connect(process.env.MONGODB_URI, {
    bufferCommands: false,
    readPreference: 'primary',
    serverSelectionTimeoutMS: 10000,
  });
  const records = await mongoose.connection.db.collection('syncRecords').find(
    {
      teamId,
      $or: [{ table: 'matches', recordId: matchId }, { 'data.matchId': matchId }],
    },
    { projection: { _id: 0, table: 1, recordId: 1, data: 1, revision: 1, deletedAt: 1, updatedAt: 1 } },
  ).toArray();
  const currentMatch = records.find((record) => record.table === 'matches' && record.recordId === matchId);
  if (!currentMatch) throw new Error('The match is not present in Atlas for the specified team. No recovery can be planned.');

  const cloudEvents = records.filter((record) => record.table === 'events');
  const byEventId = new Map(cloudEvents.map((record) => [record.recordId, record]));
  const localEventIds = new Set(local.events.map((event) => event.id));
  const activeCloudEvents = cloudEvents.filter((record) => !record.deletedAt);
  const duplicateLocalIds = local.events.filter((event, index, all) => all.findIndex((other) => other.id === event.id) !== index).map((event) => event.id);
  const orphanEventIds = local.events.filter((event) => !local.innings.some((inning) => inning.id === event.inningsId)).map((event) => event.id);
  const proposed = [];
  const collisions = [];
  const alreadyPresent = [];
  for (const event of local.events.sort((a, b) => a.seq - b.seq)) {
    const cloud = byEventId.get(event.id);
    if (!cloud) {
      proposed.push({
        recordId: event.id,
        seq: event.seq,
        type: event.type,
        inningsId: event.inningsId,
        startId: event.startId || null,
        fingerprint: fingerprint(event),
      });
    } else if (cloud.deletedAt) {
      collisions.push({ recordId: event.id, reason: 'Atlas has a tombstone for this event ID.' });
    } else if (fingerprint(cloud.data) !== fingerprint(event)) {
      collisions.push({ recordId: event.id, reason: 'Atlas has different payload data for this event ID.' });
    } else {
      alreadyPresent.push(event.id);
    }
  }
  const unexpectedCloud = activeCloudEvents
    .filter((record) => !localEventIds.has(record.recordId))
    .map((record) => record.recordId);
  const localStartIds = distinct([local.match.startId, ...local.innings.map((inning) => inning.startId), ...local.events.map((event) => event.startId)].filter(Boolean));
  const startIdMatches = localStartIds.length === 1 && localStartIds[0] === currentMatch.data?.startId;
  const expected = replay(local);
  const eventSequences = local.events.map((event) => event.seq).sort((a, b) => a - b);
  const safeToQueue = Boolean(
    startIdMatches &&
    !duplicateLocalIds.length &&
    !orphanEventIds.length &&
    !collisions.length &&
    !unexpectedCloud.length &&
    proposed.length &&
    proposed.length + alreadyPresent.length === local.events.length,
  );

  console.log(JSON.stringify({
    mode: 'read-only recovery plan',
    queriedAt: new Date().toISOString(),
    teamId,
    matchId,
    atlas: {
      matchRevision: currentMatch.revision,
      matchUpdatedAt: currentMatch.updatedAt,
      matchStatus: currentMatch.data?.status || null,
      matchSnapshot: currentMatch.data?.syncSnapshot || null,
      activeEvents: activeCloudEvents.length,
      deletedEventRecords: cloudEvents.filter((record) => record.deletedAt).map((record) => record.recordId),
      activeInnings: records.filter((record) => record.table === 'innings' && !record.deletedAt).length,
    },
    verifiedBackup: {
      events: local.events.length,
      innings: local.innings.length,
      eventSeq: { first: eventSequences[0], last: eventSequences.at(-1) },
      replay: expected,
    },
    conflictChecks: {
      startIdMatches,
      localStartIds,
      duplicateLocalIds,
      orphanEventIds,
      eventIdCollisions: collisions,
      unexpectedActiveAtlasEventIds: unexpectedCloud,
    },
    proposedOperations: {
      eventCreates: proposed,
      alreadyPresentEventIds: alreadyPresent,
      postEventCompletionCommit: safeToQueue ? {
        table: 'matches',
        recordId: matchId,
        baseRevision: currentMatch.revision,
        change: 'Attach only a verified { innings: 2, events: 301 } syncSnapshot to the current Atlas match after the server replays the uploaded history.',
      } : null,
    },
    safeToQueue,
    note: 'This command performed MongoDB find operations only. It neither uploads events nor changes the completion record.',
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
