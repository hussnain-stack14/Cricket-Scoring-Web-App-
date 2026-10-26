/* Read-only local backup comparison. It never imports, syncs, or modifies either backup. */
import { readFile } from 'node:fs/promises';
import { matchStates, result } from '../lib/engine.js';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const mobilePath = option('--mobile');
const desktopPath = option('--desktop');
const matchId = option('--match-id');
if (!mobilePath || !desktopPath || !matchId)
  throw new Error('Use --mobile <backup> --desktop <backup> --match-id <uuid>.');

const [mobile, desktop] = await Promise.all(
  [mobilePath, desktopPath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);
const withoutWorkspace = (record) => {
  const clone = structuredClone(record);
  delete clone.workspaceId;
  return JSON.stringify(clone);
};
const duplicate = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const forMatch = (backup) => ({
  match: backup.matches.find((record) => record.id === matchId),
  innings: backup.innings.filter((record) => record.matchId === matchId),
  events: backup.events.filter((record) => record.matchId === matchId),
});
function replay(history) {
  try {
    const states = matchStates(history.match, history.innings, history.events);
    return {
      scores: states.map((state, index) => ({
        innings: index + 1,
        runs: state.runs,
        wickets: state.wickets,
        balls: state.balls,
        overs: `${Math.floor(state.balls / 6)}.${state.balls % 6}`,
        completed: state.done,
        extras: state.extras,
      })),
      result: result(history.match, states),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not replay history.' };
  }
}
function integrity(history) {
  const inningsIds = new Set(history.innings.map((record) => record.id));
  return {
    duplicateEventIds: duplicate(history.events.map((record) => record.id)),
    duplicateSeq: duplicate(history.events.map((record) => record.seq)),
    orphanEventIds: history.events
      .filter((record) => !inningsIds.has(record.inningsId))
      .map((record) => record.id),
  };
}
const mobileHistory = forMatch(mobile);
const desktopHistory = forMatch(desktop);
if (!mobileHistory.match || !desktopHistory.match) throw new Error('The match is not present in both backups.');
const desktopById = new Map(desktopHistory.events.map((record) => [record.id, record]));
const missingOnDesktop = mobileHistory.events.filter((record) => !desktopById.has(record.id));
const changedShared = mobileHistory.events
  .filter((record) => desktopById.has(record.id))
  .filter((record) => withoutWorkspace(record) !== withoutWorkspace(desktopById.get(record.id)));
const types = Object.fromEntries(
  ['delivery', 'bowler', 'batter'].map((type) => [type, missingOnDesktop.filter((record) => record.type === type).length]),
);
const ranges = (numbers) => {
  const sorted = [...numbers].filter(Number.isInteger).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const output = [];
  let start = sorted[0], end = sorted[0];
  for (const value of sorted.slice(1)) {
    if (value === end + 1) end = value;
    else { output.push(start === end ? String(start) : `${start}-${end}`); start = end = value; }
  }
  output.push(start === end ? String(start) : `${start}-${end}`);
  return output;
};
console.log(JSON.stringify({
  mobileWorkspaceId: mobile.workspace?.id,
  desktopWorkspaceId: desktop.workspace?.id,
  matchId,
  events: {
    mobile: mobileHistory.events.length,
    desktop: desktopHistory.events.length,
    missingOnDesktop: missingOnDesktop.length,
    changedShared: changedShared.length,
    missingSeq: {
      first: Math.min(...missingOnDesktop.map((record) => record.seq)),
      last: Math.max(...missingOnDesktop.map((record) => record.seq)),
      ranges: ranges(missingOnDesktop.map((record) => record.seq)),
    },
    presentSeq: {
      mobile: ranges(mobileHistory.events.map((record) => record.seq)),
      desktop: ranges(desktopHistory.events.map((record) => record.seq)),
    },
    missingTypes: types,
  },
  relationships: { mobile: integrity(mobileHistory), desktop: integrity(desktopHistory) },
  replay: { mobile: replay(mobileHistory), desktop: replay(desktopHistory) },
  teamIds: {
    mobile: mobile.teams.map((team) => ({ id: team.id, name: team.name, archived: Boolean(team.archived) })),
    desktop: desktop.teams.map((team) => ({ id: team.id, name: team.name, archived: Boolean(team.archived) })),
  },
}, null, 2));
