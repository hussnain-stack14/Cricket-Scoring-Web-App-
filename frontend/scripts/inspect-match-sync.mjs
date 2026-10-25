/*
 * Read-only Atlas forensic tool. It never writes, deletes, or prints credentials/delivery payloads.
 * Usage:
 *   npm run inspect:match-sync -- --team-id CRS-353209 --match-id <uuid> --date 2026-10-25
 */
import mongoose from 'mongoose';
import { SyncRecord } from '../backend/models.js';
import { matchStates, overs } from '../lib/engine.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env.local'); } catch { /* reported below */ }
}
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const teamId = option('--team-id');
const matchId = option('--match-id');
const date = option('--date') || null;
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!teamId || !matchId) throw new Error('Use --team-id <internal-team-id> --match-id <match-uuid>. No database query was made.');

const publicRecord = (record) => ({
  table: record.table,
  recordId: record.recordId,
  revision: record.revision,
  updatedAt: record.updatedAt,
  deletedAt: record.deletedAt,
});
function replay(match, innings, events) {
  try {
    return {
      scores: matchStates(match, innings, events).map((state, index) => ({
        innings: index + 1,
        runs: state.runs,
        wickets: state.wickets,
        overs: overs(state.balls),
        completed: Boolean(state.done),
      })),
    };
  } catch (error) {
    return { replayError: error instanceof Error ? error.message.slice(0, 180) : 'Unable to replay history.' };
  }
}
function eventIntegrity(events, innings) {
  const ids = events.map((event) => event.id).filter(Boolean);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const knownInnings = new Set(innings.map((inning) => inning.id));
  const orphanEvents = events.filter((event) => !knownInnings.has(event.inningsId)).map((event) => event.id);
  const byInnings = events.reduce((groups, event) => {
    const key = event.inningsId || 'unlinked';
    (groups[key] ||= []).push(event);
    return groups;
  }, {});
  const sequences = Object.fromEntries(
    Object.entries(byInnings).map(([inningsId, rows]) => {
      const seq = rows.map((row) => row.seq).filter(Number.isInteger).sort((a, b) => a - b);
      const duplicateSeq = [...new Set(seq.filter((value, index) => seq.indexOf(value) !== index))];
      const gaps = seq.filter((value, index) => index > 0 && value !== seq[index - 1] + 1);
      return [inningsId, { count: rows.length, firstSeq: seq[0] ?? null, lastSeq: seq.at(-1) ?? null, duplicateSeq, gapAfter: gaps.map((value) => value - 1) }];
    }),
  );
  return { duplicateIds, orphanEvents, sequences };
}

try {
  // Use primary to avoid misclassifying recently persisted deliveries as missing.
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, readPreference: 'primary', serverSelectionTimeoutMS: 10000 });
  const records = await SyncRecord.find(
    { teamId, $or: [{ table: 'matches', recordId: matchId }, { 'data.matchId': matchId }] },
    { _id: 0, __v: 0, lastChangeId: 0, 'data.deliveries': 0 },
  ).sort({ table: 1, 'data.seq': 1, updatedAt: 1 }).lean();
  const matchRecord = records.find((record) => record.table === 'matches' && record.recordId === matchId);
  const active = records.filter((record) => !record.deletedAt);
  const deleted = records.filter((record) => record.deletedAt);
  const innings = active.filter((record) => record.table === 'innings').map((record) => record.data);
  const events = active.filter((record) => record.table === 'events').map((record) => record.data);
  const duplicateRecordIds = [...new Set(records.map((record) => `${record.table}:${record.recordId}`).filter((key, index, all) => all.indexOf(key) !== index))];
  const report = {
    queriedAt: new Date().toISOString(),
    accountKey: teamId,
    requestedMatchId: matchId,
    expectedDate: date,
    found: Boolean(matchRecord),
    match: matchRecord ? {
      ...publicRecord(matchRecord),
      status: matchRecord.data.status,
      date: matchRecord.data.date || matchRecord.data.scheduledAt || null,
      completedAt: matchRecord.data.completedAt || null,
      syncSnapshot: matchRecord.data.syncSnapshot || null,
      teams: (matchRecord.data.teams || []).map((team) => ({ id: team.id, name: team.name })),
    } : null,
    activeCounts: { innings: innings.length, events: events.length },
    deletedRecords: deleted.map(publicRecord),
    activeRecords: active.map(publicRecord),
    duplicateRecordIds,
    eventIntegrity: eventIntegrity(events, innings),
    replay: matchRecord ? replay(matchRecord.data, innings, events) : null,
    note: 'syncRecords stores only the latest record revision; it does not retain a server-side operation history. No record was changed by this diagnostic.',
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
