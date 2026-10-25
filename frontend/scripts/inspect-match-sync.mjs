/* Read-only production forensic tool. It never writes or prints raw deliveries/connection URIs.
 * Usage: npm run inspect:match-sync -- --team-id <internal-team-id> --date 2026-10-25 */
import mongoose from 'mongoose';
import { SyncRecord } from '../backend/models.js';
import { matchStates, overs } from '../lib/engine.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env.local'); } catch { /* reported below */ }
}
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const teamId = option('--team-id');
const date = option('--date') || '2026-10-25';
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured. No database query was made.');
if (!teamId) throw new Error('Use --team-id <internal-team-id>. No database query was made.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use --date YYYY-MM-DD. No database query was made.');

const publicRecord = (record) => ({ table: record.table, recordId: record.recordId, revision: record.revision, updatedAt: record.updatedAt, deletedAt: record.deletedAt });
function scores(match, innings, events) {
  try {
    return matchStates(match, innings, events).map((state, index) => ({ innings: index + 1, runs: state.runs, wickets: state.wickets, overs: overs(state.balls), completed: Boolean(state.done) }));
  } catch (error) {
    return { replayError: error instanceof Error ? error.message.slice(0, 180) : 'Unable to replay history.' };
  }
}

try {
  // Use the primary: a lagging secondary could falsely report missing final deliveries.
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, readPreference: 'primary', serverSelectionTimeoutMS: 10000 });
  const matches = await SyncRecord.find({ teamId, table: 'matches', deletedAt: null, $or: [{ 'data.date': date }, { 'data.scheduledAt': new RegExp(`^${date}`) }] }, { _id: 0, __v: 0, lastChangeId: 0 }).sort({ updatedAt: 1, recordId: 1 }).lean();
  const reports = [];
  for (const matchRecord of matches) {
    const match = matchRecord.data;
    const names = (match.teams || []).map((team) => String(team.name || '').toLowerCase());
    if (!names.includes('royal club') || !names.includes('chota latiyawala')) continue;
    const children = await SyncRecord.find({ teamId, deletedAt: null, $or: [{ table: 'innings', 'data.matchId': matchRecord.recordId }, { table: 'events', 'data.matchId': matchRecord.recordId }] }, { _id: 0, __v: 0, lastChangeId: 0 }).sort({ table: 1, 'data.seq': 1, updatedAt: 1 }).lean();
    const innings = children.filter((record) => record.table === 'innings').map((record) => record.data);
    const events = children.filter((record) => record.table === 'events').map((record) => record.data);
    reports.push({ accountKey: teamId, match: { ...publicRecord(matchRecord), status: match.status, date: match.date || match.scheduledAt || null, completedAt: match.completedAt || null, syncSnapshot: match.syncSnapshot || null, scores: scores(match, innings, events) }, childCounts: { innings: innings.length, events: events.length }, childRecords: children.map(publicRecord) });
  }
  console.log(JSON.stringify({ queriedAt: new Date().toISOString(), date, teamId, matches: reports }, null, 2));
} finally { await mongoose.disconnect(); }
