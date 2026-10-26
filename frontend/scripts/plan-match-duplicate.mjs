/*
 * Read-only planner for duplicating one verified match from a Crease v2 backup.
 * It prints a deterministic proposal and never writes to IndexedDB or MongoDB.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { v5 as uuidv5, validate as validUuid } from 'uuid';
import { matchStates, overs, result } from '../lib/engine.js';

if (!process.env.MONGODB_URI && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env.local'); } catch { /* Atlas verification reports this below. */ }
}
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const backupPath = option('--backup');
const teamId = option('--team-id');
const sourceMatchId = option('--source-match-id');
const newMatchId = option('--new-match-id');
const verifyAtlas = args.includes('--verify-atlas');
if (!backupPath || !teamId || !sourceMatchId || !newMatchId || !validUuid(newMatchId))
  throw new Error('Use --backup <file> --team-id <account> --source-match-id <uuid> --new-match-id <uuid>.');

const backup = JSON.parse(await readFile(backupPath, 'utf8'));
if (backup?.app !== 'crease' || backup?.version !== 2) throw new Error('Expected a Crease v2 backup.');
const sourceMatch = backup.matches?.find((row) => row.id === sourceMatchId);
if (!sourceMatch) throw new Error('Source match is absent from the backup.');
const sourceInnings = (backup.innings || []).filter((row) => row.matchId === sourceMatchId).sort((a, b) => a.number - b.number);
const sourceEvents = (backup.events || []).filter((row) => row.matchId === sourceMatchId).sort((a, b) => a.seq - b.seq);
if (sourceInnings.length !== 2 || sourceEvents.length !== 301) throw new Error('Expected exactly two innings and 301 source events.');

const duplicate = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const playerIds = new Set((backup.players || []).map((row) => row.id));
const teamIds = new Set((backup.teams || []).map((row) => row.id));
const frozenPlayers = sourceMatch.teams.flatMap((team) => team.squad.map((player) => player.id));
const referencedPlayers = [
  ...frozenPlayers,
  ...sourceInnings.flatMap((inning) => [inning.striker, inning.nonStriker, inning.bowler]),
  ...sourceEvents.map((event) => event.player).filter(Boolean),
  ...sourceEvents.map((event) => event.wicket?.player).filter(Boolean),
].filter(Boolean);
const referenceErrors = [
  ...sourceMatch.teams.filter((team) => !teamIds.has(team.id)).map((team) => `Missing team ${team.id}`),
  ...referencedPlayers.filter((id) => !playerIds.has(id)).map((id) => `Missing player ${id}`),
];
const sourceIds = [sourceMatch.id, ...sourceInnings.map((row) => row.id), ...sourceEvents.map((row) => row.id)];
if (duplicate(sourceIds).length) throw new Error('The source history has duplicate record IDs.');
if (duplicate(sourceEvents.map((event) => event.seq)).length) throw new Error('The source history has duplicate sequences.');
if (referenceErrors.length) throw new Error(referenceErrors.join('; '));

const inningId = new Map(sourceInnings.map((row) => [row.id, uuidv5(`innings:${row.id}`, newMatchId)]));
const eventId = new Map(sourceEvents.map((row) => [row.id, uuidv5(`event:${row.id}`, newMatchId)]));
const workspaceId = '<authenticated-workspace-for-CRS-353209>';
const match = {
  ...structuredClone(sourceMatch),
  id: newMatchId,
  workspaceId,
  revision: 0,
  statisticsExcluded: true,
  sourceMatchId,
  syncSnapshot: { innings: 2, events: 301, verified: true },
};
const innings = sourceInnings.map((row) => ({
  ...structuredClone(row), id: inningId.get(row.id), matchId: newMatchId, workspaceId,
}));
const events = sourceEvents.map((row) => ({
  ...structuredClone(row),
  id: eventId.get(row.id),
  matchId: newMatchId,
  inningsId: inningId.get(row.inningsId),
  workspaceId,
}));
if (events.some((event) => !event.inningsId)) throw new Error('An event refers to an unmapped innings.');

const states = matchStates(match, innings, events);
const replay = {
  innings: states.map((state, index) => ({
    number: index + 1,
    runs: state.runs,
    wickets: state.wickets,
    balls: state.balls,
    overs: overs(state.balls),
    completed: Boolean(state.done),
    extras: state.extras,
  })),
  result: result(match, states),
};
const expected = states.length === 2 && states[0].runs === 145 && states[0].wickets === 10 &&
  states[0].balls === 112 && states[1].runs === 146 && states[1].wickets === 6 &&
  states[1].balls === 98 && states.every((state) => state.done) &&
  replay.result === 'Chota latiyawala won by 4 wickets';
if (!expected) throw new Error('The remapped history did not replay to the expected result.');

const manifestHash = createHash('sha256').update(JSON.stringify({ match, innings, events })).digest('hex');
let atlas = { requested: verifyAtlas, verified: false, reason: verifyAtlas ? null : 'Atlas verification not requested.' };
if (verifyAtlas) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for --verify-atlas.');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, readPreference: 'primary', serverSelectionTimeoutMS: 10000 });
    const records = mongoose.connection.db.collection('syncRecords');
    const proposedIds = [newMatchId, ...innings.map((row) => row.id), ...events.map((row) => row.id)];
    const [account, existing, teams, players] = await Promise.all([
      mongoose.connection.db.collection('teamAccounts').findOne({ teamId }, { projection: { _id: 1 } }),
      records.find({ teamId, recordId: { $in: proposedIds } }, { projection: { _id: 0, table: 1, recordId: 1, deletedAt: 1 } }).toArray(),
      records.find({ teamId, table: 'teams', recordId: { $in: sourceMatch.teams.map((team) => team.id) }, deletedAt: null }, { projection: { _id: 0, recordId: 1 } }).toArray(),
      records.find({ teamId, table: 'players', recordId: { $in: [...new Set(referencedPlayers)] }, deletedAt: null }, { projection: { _id: 0, recordId: 1 } }).toArray(),
    ]);
    const cloudTeamIds = new Set(teams.map((row) => row.recordId));
    const cloudPlayerIds = new Set(players.map((row) => row.recordId));
    atlas = {
      requested: true,
      verified: Boolean(account) && !existing.length &&
        sourceMatch.teams.every((team) => cloudTeamIds.has(team.id)) &&
        [...new Set(referencedPlayers)].every((id) => cloudPlayerIds.has(id)),
      accountExists: Boolean(account),
      proposedIdCollisions: existing,
      existingTeams: teams.length,
      requiredTeams: sourceMatch.teams.length,
      existingPlayers: players.length,
      requiredPlayers: new Set(referencedPlayers).size,
    };
  } finally {
    await mongoose.disconnect();
  }
}

console.log(JSON.stringify({
  mode: 'dry-run; no writes',
  accountScope: teamId,
  sourceMatchId,
  newMatchId,
  recordMapping: {
    rule: 'UUIDv5("innings:<old-id>" or "event:<old-id>", newMatchId)',
    innings: sourceInnings.map((row) => ({ oldId: row.id, newId: inningId.get(row.id), number: row.number })),
    events: events.map((row, index) => ({ seq: row.seq, type: row.type, oldId: sourceEvents[index].id, newId: row.id, inningsId: row.inningsId })),
  },
  references: {
    teams: sourceMatch.teams.map((team) => ({ id: team.id, name: team.name, squad: team.squad.length })),
    referencedPlayers: new Set(referencedPlayers).size,
    invalidReferences: referenceErrors,
    newTeams: 0,
    newPlayers: 0,
  },
  proposedWrites: {
    matches: 1,
    innings: 2,
    events: 301,
    total: 304,
    matchStatus: match.status,
    syncSnapshot: match.syncSnapshot,
    statisticsExcluded: match.statisticsExcluded,
    queueOrder: ['301 event creates and 2 innings creates', 'completed match commit after server history verification'],
  },
  replay,
  manifestSha256: manifestHash,
  atlas,
  valid: expected && !referenceErrors.length && (!verifyAtlas || atlas.verified),
  note: 'No IndexedDB or MongoDB record was created, updated, or deleted.',
}, null, 2));
