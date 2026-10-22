import Dexie from 'dexie';
import { validateSetup, matchStates, replay } from './engine.js';
export const db = new Dexie('crease-local');
db.version(1).stores({
  workspaces: 'id',
  players: 'id,workspaceId',
  teams: 'id,workspaceId',
  memberships: 'id,workspaceId,teamId',
  matches: 'id,workspaceId',
  innings: 'id,workspaceId,matchId',
  events: 'id,workspaceId,matchId,inningsId',
  audits: 'id,workspaceId,matchId',
});
// Additive migration: retain all v1 records and introduce persisted setup drafts.
db.version(2).stores({ drafts: 'id,workspaceId' });
db.version(3).stores({
  syncMeta: 'workspaceId,teamId',
  pendingChanges: 'id,workspaceId,table,recordId,syncedAt',
});
db.version(4).stores({ appState: 'id' });
export const tables = [
  'players',
  'teams',
  'memberships',
  'matches',
  'innings',
  'events',
  'audits',
  'drafts',
];
export const uuid = () => crypto.randomUUID();
export const defaults = { overs: 5, size: 6, maxBowler: 2, freeHit: true };
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
export async function queueSyncChange(workspaceId, table, recordId, data, deleted = false) {
  const meta = await db.syncMeta.get(workspaceId);
  if (!meta?.teamId) return;
  const id = `${workspaceId}:${table}:${recordId}`;
  const previous = await db.pendingChanges.get(id);
  const key = `${table}:${recordId}`;
  await db.pendingChanges.put({
    id,
    changeId: uuid(),
    workspaceId,
    table,
    recordId,
    data: { ...data },
    deleted,
    baseRevision: previous?.baseRevision ?? meta.revisions?.[key] ?? 0,
    queuedAt: new Date().toISOString(),
  });
  await db.syncMeta.put({ ...meta, syncStatus: 'pending', lastError: null });
}
export async function workspace() {
  const state = await db.appState.get('active-workspace');
  const active = state?.workspaceId && (await db.workspaces.get(state.workspaceId));
  if (active) return active;

  const linkedIds = new Set(
    (await db.syncMeta.toArray())
      .filter((meta) => meta.teamId)
      .map((meta) => meta.workspaceId),
  );
  return (await db.workspaces.toArray()).find((item) => !linkedIds.has(item.id)) ?? null;
}
export async function findGuestWorkspace() {
  const linkedIds = new Set(
    (await db.syncMeta.toArray())
      .filter((meta) => meta.teamId)
      .map((meta) => meta.workspaceId),
  );
  const state = await db.appState.get('active-workspace');
  const active = state?.workspaceId && (await db.workspaces.get(state.workspaceId));
  const guest = active && !linkedIds.has(active.id)
    ? active
    : (await db.workspaces.toArray()).find((item) => !linkedIds.has(item.id)) ?? null;
  if (guest) await setActiveWorkspace(guest.id);
  else if (state?.teamId) await db.appState.delete(state.id);
  return guest;
}
export async function setActiveWorkspace(workspaceId, teamId = null) {
  await db.appState.put({ id: 'active-workspace', workspaceId, teamId });
}
export async function listWorkspaces() {
  return db.workspaces.toArray();
}
export async function activateAccountWorkspace(teamId, name) {
  const mapping = await db.syncMeta.where('teamId').equals(teamId).first();
  let accountWorkspace = mapping && (await db.workspaces.get(mapping.workspaceId));
  if (!accountWorkspace) {
    accountWorkspace = {
      id: mapping?.workspaceId || uuid(),
      name: name.trim() || 'Team account',
      rules: defaults,
      createdAt: new Date().toISOString(),
    };
    await db.workspaces.add(accountWorkspace);
  }
  await db.transaction('rw', db.syncMeta, db.appState, async () => {
    const meta = (await db.syncMeta.get(accountWorkspace.id)) ?? {
      workspaceId: accountWorkspace.id,
      teamId,
      syncStatus: 'pending',
      revisions: {},
      conflicts: [],
    };
    await db.syncMeta.put({ ...meta, teamId });
    await db.appState.put({
      id: 'active-workspace',
      workspaceId: accountWorkspace.id,
      teamId,
    });
  });
  return accountWorkspace;
}
export async function activateGuestWorkspace() {
  const workspaces = await db.workspaces.toArray();
  const accountMappings = new Set(
    (await db.syncMeta.toArray()).filter((meta) => meta.teamId).map((meta) => meta.workspaceId),
  );
  let guestWorkspace = workspaces.find((item) => !accountMappings.has(item.id));
  if (!guestWorkspace) {
    guestWorkspace = {
      id: uuid(),
      name: 'Local scorer',
      rules: defaults,
      createdAt: new Date().toISOString(),
    };
    await db.workspaces.add(guestWorkspace);
  }
  await setActiveWorkspace(guestWorkspace.id);
  return guestWorkspace;
}
export async function createWorkspace(name) {
  must(name.trim(), 'Enter your display name.');
  return db.transaction('rw', db.workspaces, db.appState, db.syncMeta, async () => {
    const existing = await workspace();
    if (existing) {
      await db.appState.put({ id: 'active-workspace', workspaceId: existing.id, teamId: null });
      return existing;
    }
    const w = {
      id: uuid(),
      name: name.trim(),
      rules: defaults,
      createdAt: new Date().toISOString(),
    };
    await db.workspaces.add(w);
    await db.appState.put({ id: 'active-workspace', workspaceId: w.id, teamId: null });
    return w;
  });
}
export async function all(workspaceId) {
  const rows = await Promise.all(tables.map((t) => db[t].where({ workspaceId }).toArray()));
  return Object.fromEntries(tables.map((t, i) => [t, rows[i]]));
}
export async function saveWorkspace(w) {
  must(await db.workspaces.get(w.id), 'Workspace missing.');
  await db.workspaces.put(w);
}
export async function saveRecord(workspaceId, table, record) {
  must(['players', 'teams', 'drafts'].includes(table), 'Unsupported record type.');
  return db.transaction(
    'rw',
    db[table],
    db.workspaces,
    db.syncMeta,
    db.pendingChanges,
    async () => {
    must(await db.workspaces.get(workspaceId), 'Workspace missing.');
    const old = record.id && (await db[table].get(record.id));
    must(!old || old.workspaceId === workspaceId, 'Record belongs to another workspace.');
    if (table !== 'drafts')
      must(
        typeof record.name === 'string' &&
          record.name.trim().length > 0 &&
          record.name.length <= 100,
        'Name must be 1–100 characters.',
      );
    const value = { ...record, id: record.id || uuid(), workspaceId };
    await db[table].put(value);
    await queueSyncChange(workspaceId, table, value.id, value);
    return value;
    },
  );
}
export async function saveTeam(workspaceId, team, members) {
  must(new Set(members).size === members.length, 'Duplicate squad members.');
  return db.transaction(
    'rw',
    db.teams,
    db.memberships,
    db.players,
    db.workspaces,
    db.syncMeta,
    db.pendingChanges,
    async () => {
    for (const id of members)
      must((await db.players.get(id))?.workspaceId === workspaceId, 'Player not in workspace.');
    must(!team.captain || members.includes(team.captain), 'Captain must be a squad member.');
    must(!team.keeper || members.includes(team.keeper), 'Wicketkeeper must be a squad member.');
    const saved = await saveRecord(workspaceId, 'teams', team);
    const oldMemberships = await db.memberships
      .where({ workspaceId })
      .filter((m) => m.teamId === saved.id)
      .toArray();
    for (const membership of oldMemberships) {
      await queueSyncChange(workspaceId, 'memberships', membership.id, membership, true);
      await db.memberships.delete(membership.id);
    }
    const newMemberships = members.map((playerId) => ({
      id: uuid(),
      workspaceId,
      teamId: saved.id,
      playerId,
    }));
    await db.memberships.bulkAdd(newMemberships);
    for (const membership of newMemberships)
      await queueSyncChange(workspaceId, 'memberships', membership.id, membership);
    },
  );
}
export async function deleteRecord(workspaceId, table, id) {
  must(['players', 'teams'].includes(table), 'Unsupported record type.');
  const deletingTeam = table === 'teams';
  return db.transaction(
    'rw',
    db[table],
    db.memberships,
    db.matches,
    db.drafts,
    db.workspaces,
    db.syncMeta,
    db.pendingChanges,
    async () => {
      must(await db.workspaces.get(workspaceId), 'Workspace missing.');
      const record = await db[table].get(id);
      must(record?.workspaceId === workspaceId, 'Record missing.');
      const matches = await db.matches.where({ workspaceId }).toArray();
      const usedInMatch = matches.some((match) =>
        deletingTeam
          ? match.teams.some((team) => team.id === id)
          : match.teams.some((team) => team.squad.some((player) => player.id === id)),
      );
      must(
        !usedInMatch,
        `Cannot permanently delete this ${deletingTeam ? 'team' : 'player'} because match history references it. Archive it instead.`,
      );
      const drafts = await db.drafts.where({ workspaceId }).toArray();
      for (const draft of drafts) {
        const referenced = deletingTeam
          ? draft.teamA === id || draft.teamB === id
          : draft.squadA.includes(id) ||
            draft.squadB.includes(id) ||
            ['striker', 'nonStriker', 'bowler'].some((key) => draft[key] === id);
        if (!referenced) continue;
        if (deletingTeam) {
          for (const side of ['A', 'B']) {
            if (draft[`team${side}`] === id) {
              draft[`team${side}`] = '';
              draft[`squad${side}`] = [];
            }
          }
          draft.striker = '';
          draft.nonStriker = '';
          draft.bowler = '';
        } else {
          draft.squadA = draft.squadA.filter((playerId) => playerId !== id);
          draft.squadB = draft.squadB.filter((playerId) => playerId !== id);
          for (const key of ['striker', 'nonStriker', 'bowler'])
            if (draft[key] === id) draft[key] = '';
        }
        draft.step = 0;
        await db.drafts.put(draft);
        await queueSyncChange(workspaceId, 'drafts', draft.id, draft);
      }
      const memberships = await db.memberships
        .where({ workspaceId })
        .filter((membership) =>
          deletingTeam ? membership.teamId === id : membership.playerId === id,
        )
        .toArray();
      for (const membership of memberships) {
        await queueSyncChange(workspaceId, 'memberships', membership.id, membership, true);
        await db.memberships.delete(membership.id);
      }
      await queueSyncChange(workspaceId, table, id, record, true);
      await db[table].delete(id);
    },
  );
}
export async function createMatch(
  workspaceId,
  match,
  opening = { striker: '', nonStriker: '', bowler: '' },
) {
  validateSetup(match);
  return db.transaction(
    'rw',
    db.matches,
    db.innings,
    db.drafts,
    db.players,
    db.memberships,
    db.teams,
    db.syncMeta,
    db.pendingChanges,
    async () => {
      for (const t of match.teams) {
        must((await db.teams.get(t.id))?.workspaceId === workspaceId, 'Team missing.');
        for (const p of t.squad) {
          must((await db.players.get(p.id))?.workspaceId === workspaceId, 'Player missing.');
          must(
            await db.memberships
              .where({ workspaceId })
              .filter((x) => x.teamId === t.id && x.playerId === p.id)
              .count(),
            'Player is not in this team.',
          );
        }
      }
      const m = {
        ...match,
        id: uuid(),
        workspaceId,
        revision: 0,
        status: 'live',
        createdAt: new Date().toISOString(),
      };
      const inn = { ...opening, id: uuid(), workspaceId, matchId: m.id, number: 1 };
      replay(m, inn, []);
      await db.matches.add(m);
      await db.innings.add(inn);
      await queueSyncChange(workspaceId, 'matches', m.id, m);
      await queueSyncChange(workspaceId, 'innings', inn.id, inn);
      const drafts = await db.drafts.where({ workspaceId }).toArray();
      for (const draft of drafts) {
        await queueSyncChange(workspaceId, 'drafts', draft.id, draft, true);
        await db.drafts.delete(draft.id);
      }
      return m;
    },
  );
}
export async function addMatchPlayer(
  workspaceId,
  matchId,
  revision,
  teamId,
  { name = '', role = 'Batter', playerId = '', selection = null } = {},
) {
  return db.transaction(
    'rw',
    db.workspaces,
    db.matches,
    db.players,
    db.memberships,
    db.innings,
    db.events,
    db.syncMeta,
    db.pendingChanges,
    async () => {
      must(await db.workspaces.get(workspaceId), 'Workspace missing.');
      const match = await db.matches.get(matchId);
      must(match?.workspaceId === workspaceId, 'Match missing.');
      must(
        match.revision === revision,
        'This match changed in another tab. Refresh before adding players.',
      );
      must(match.status !== 'completed', 'Reopen this match before adding players.');
      const teamIndex = match.teams.findIndex((team) => team.id === teamId);
      must(teamIndex !== -1, 'Choose a team in this match.');

      let player = playerId ? await db.players.get(playerId) : null;
      if (playerId) must(player?.workspaceId === workspaceId, 'Player not in this workspace.');
      else {
        must(
          typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100,
          'Player name must be 1–100 characters.',
        );
        player = {
          id: uuid(),
          workspaceId,
          name: name.trim(),
          role: role === 'Bowler' ? 'Bowler' : 'Batter',
          battingStyle: '',
          bowlingStyle: '',
        };
        await db.players.add(player);
        await queueSyncChange(workspaceId, 'players', player.id, player);
      }

      const team = match.teams[teamIndex];
      const alreadySelected = team.squad.some((member) => member.id === player.id);
      must(
        !match.teams[1 - teamIndex].squad.some((member) => member.id === player.id),
        'This player is already assigned to the opposing match team.',
      );
      must(
        alreadySelected || team.squad.length < match.rules.size,
        'This team has reached the configured player limit.',
      );
      if (!alreadySelected) team.squad.push({ id: player.id, name: player.name });
      const membershipExists = await db.memberships
        .where({ workspaceId })
        .filter((membership) => membership.teamId === teamId && membership.playerId === player.id)
        .count();
      if (!membershipExists) {
        const membership = { id: uuid(), workspaceId, teamId, playerId: player.id };
        await db.memberships.add(membership);
        await queueSyncChange(workspaceId, 'memberships', membership.id, membership);
      }

      const innings = await db.innings
        .where({ workspaceId })
        .filter((inning) => inning.matchId === matchId)
        .toArray();
      innings.sort((a, b) => a.number - b.number);
      const events = await db.events
        .where({ workspaceId })
        .filter((event) => event.matchId === matchId)
        .toArray();
      events.sort((a, b) => a.seq - b.seq);
      if (selection) {
        const inning = innings.at(-1);
        const states = matchStates(match, innings, events);
        const state = states.at(-1);
        if (selection.type === 'batter') {
          must(
            teamIndex === (inning.number === 1 ? match.firstBat : 1 - match.firstBat) &&
              state.needBatter,
            'A batter cannot be selected at this time or for this team.',
          );
        } else if (selection.type === 'bowler') {
          must(
            teamIndex !== (inning.number === 1 ? match.firstBat : 1 - match.firstBat) &&
              state.needBowler,
            'A bowler cannot be selected at this time or for this team.',
          );
        } else throw new Error('Unsupported player selection.');
        const event = {
          id: uuid(),
          type: selection.type,
          player: player.id,
          workspaceId,
          matchId,
          inningsId: inning.id,
          seq: (events.at(-1)?.seq || 0) + 1,
        };
        replay(
          match,
          inning,
          [...events.filter((item) => item.inningsId === inning.id), event],
          innings.length === 2 ? states[0].runs + 1 : null,
        );
        await db.events.add(event);
        await queueSyncChange(workspaceId, 'events', event.id, event);
      }
      match.revision++;
      await db.matches.put(match);
      await queueSyncChange(workspaceId, 'matches', match.id, match);
      return { match, player };
    },
  );
}
export async function changeMatch(workspaceId, id, revision, action) {
  return db.transaction(
    'rw',
    db.matches,
    db.innings,
    db.events,
    db.audits,
    db.syncMeta,
    db.pendingChanges,
    async () => {
    const m = await db.matches.get(id);
    must(m?.workspaceId === workspaceId, 'Match missing.');
    if (action.type === 'finalize' && m.status === 'completed') return m;
    if (action.type === 'event') {
      const existing = await db.events.get(action.event.id);
      if (existing?.workspaceId === workspaceId && existing.matchId === id) return m;
    }
    must(
      m.revision === revision,
      'This match changed in another tab. Refresh the match before continuing.',
    );
    let inns = await db.innings
      .where({ workspaceId })
      .filter((i) => i.matchId === id)
      .toArray();
    inns.sort((a, b) => a.number - b.number);
    let evs = await db.events
      .where({ workspaceId })
      .filter((e) => e.matchId === id)
      .toArray();
    evs.sort((a, b) => a.seq - b.seq);
    const states = matchStates(m, inns, evs);
    if (action.type === 'reopen') {
      must(m.status === 'completed', 'Match is not finalized.');
      m.status = 'live';
    } else {
      must(m.status !== 'completed', 'Reopen this match before editing.');
      if (action.type === 'finalize') {
        must(states.length === 2 && states[1].done, 'Finish both innings first.');
        m.status = 'completed';
      } else if (action.type === 'startChase') {
        must(inns.length === 1 && states[0].done, 'First innings must be complete.');
        const inn = { ...action.opening, id: uuid(), workspaceId, matchId: id, number: 2 };
        replay(m, inn, [], states[0].runs + 1);
        await db.innings.add(inn);
        await queueSyncChange(workspaceId, 'innings', inn.id, inn);
        m.status = 'live';
      } else if (action.type === 'rewind' || action.type === 'undo') {
        const selected =
          action.type === 'undo'
            ? [...evs].reverse().find((e) => e.type === 'delivery')
            : evs.find((e) => e.id === action.eventId);
        must(selected, 'No delivery to reverse.');
        const removed = evs.filter((e) => e.seq >= selected.seq);
        const audit = {
          id: uuid(),
          workspaceId,
          matchId: id,
          at: new Date().toISOString(),
          action: action.type,
          events: removed,
          innings: inns,
          reason: action.reason || 'Scorer correction',
        };
        await db.audits.add(audit);
        await queueSyncChange(workspaceId, 'audits', audit.id, audit);
        for (const event of removed)
          await queueSyncChange(workspaceId, 'events', event.id, event, true);
        const selectedInning = inns.find((i) => i.id === selected.inningsId);
        const removedInnings = inns.filter((i) => i.number > selectedInning.number);
        for (const inning of removedInnings)
          await queueSyncChange(workspaceId, 'innings', inning.id, inning, true);
        await db.events.bulkDelete(removed.map((e) => e.id));
        await db.innings.bulkDelete(
          inns.filter((i) => i.number > selectedInning.number).map((i) => i.id),
        );
        m.status = 'live';
      } else if (action.type === 'event') {
        if (await db.events.get(action.event.id)) return m;
        const inn = inns.at(-1);
        const e = {
          ...action.event,
          workspaceId,
          matchId: id,
          inningsId: inn.id,
          seq: (evs.at(-1)?.seq || 0) + 1,
        };
        replay(
          m,
          inn,
          [...evs.filter((x) => x.inningsId === inn.id), e],
          inns.length === 2 ? states[0].runs + 1 : null,
        );
        await db.events.add(e);
        await queueSyncChange(workspaceId, 'events', e.id, e);
        m.status = 'live';
      } else throw new Error('Unknown match action.');
    }
    m.revision++;
    await db.matches.put(m);
    await queueSyncChange(workspaceId, 'matches', m.id, m);
    return m;
    },
  );
}
export async function exportBackup(w) {
  return {
    app: 'crease',
    version: 2,
    exportedAt: new Date().toISOString(),
    workspace: w,
    ...(await all(w.id)),
  };
}
const isId = (x) =>
  typeof x === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function validateBackup(b) {
  must(
    b?.app === 'crease' &&
      b.version === 2 &&
      isId(b.workspace?.id) &&
      typeof b.workspace.name === 'string' &&
      b.workspace.name.length <= 100,
    'Unsupported or invalid backup.',
  );
  const rules = b.workspace.rules;
  must(
    rules &&
      Number.isInteger(rules.overs) &&
      rules.overs >= 1 &&
      rules.overs <= 50 &&
      Number.isInteger(rules.size) &&
      rules.size >= 2 &&
      rules.size <= 11 &&
      Number.isInteger(rules.maxBowler) &&
      rules.maxBowler >= 1 &&
      rules.maxBowler <= rules.overs &&
      typeof rules.freeHit === 'boolean',
    'Invalid workspace default rules.',
  );
  for (const t of tables) {
    must(Array.isArray(b[t]) && b[t].length <= 100000, `Invalid ${t} table.`);
    const ids = new Set();
    for (const r of b[t]) {
      must(
        r && isId(r.id) && r.workspaceId === b.workspace.id && !ids.has(r.id),
        `Invalid or duplicate ${t} ID.`,
      );
      ids.add(r.id);
    }
  }
  const has = (t, id) => b[t].some((r) => r.id === id);
  for (const p of [...b.players, ...b.teams])
    must(
      typeof p.name === 'string' &&
        p.name.length > 0 &&
        p.name.length <= 100 &&
        (p.archived === undefined || typeof p.archived === 'boolean'),
      'Invalid name or archive flag.',
    );
  for (const p of b.players)
    for (const key of ['role', 'battingStyle', 'bowlingStyle'])
      must(
        p[key] === undefined || (typeof p[key] === 'string' && p[key].length <= 100),
        'Invalid player details.',
      );
  must(
    new Set(b.memberships.map((x) => `${x.teamId}:${x.playerId}`)).size === b.memberships.length,
    'Duplicate squad membership.',
  );
  for (const x of b.memberships)
    must(has('teams', x.teamId) && has('players', x.playerId), 'Broken team membership.');
  for (const t of b.teams)
    for (const key of ['captain', 'keeper'])
      must(
        !t[key] || b.memberships.some((x) => x.teamId === t.id && x.playerId === t[key]),
        'Invalid captain or keeper.',
      );
  for (const m of b.matches) {
    validateSetup(m);
    must(
      ['upcoming', 'live', 'completed'].includes(m.status) &&
        Number.isInteger(m.revision) &&
        m.revision >= 0,
      'Invalid match state.',
    );
    must(
      m.teams.every(
        (t) =>
          has('teams', t.id) &&
          t.squad.every((p) => has('players', p.id) && typeof p.name === 'string'),
      ),
      'Broken frozen squad.',
    );
    const inns = b.innings.filter((i) => i.matchId === m.id).sort((a, c) => a.number - c.number);
    must(
      inns.length >= 1 && inns.length <= 2 && inns.every((i, n) => i.number === n + 1),
      'Invalid innings order.',
    );
    const events = b.events.filter((e) => e.matchId === m.id);
    must(
      new Set(events.map((e) => e.seq)).size === events.length &&
        events.every((e) => Number.isInteger(e.seq) && e.seq > 0),
      'Invalid event sequence.',
    );
    const states = matchStates(m, inns, events);
    must(inns.length < 2 || states[0].done, 'Chase before innings completion.');
    must(
      m.status !== 'completed' || (states.length === 2 && states[1].done),
      'Unfinished finalized match.',
    );
  }
  for (const i of b.innings) must(has('matches', i.matchId), 'Orphan innings.');
  for (const e of b.events)
    must(
      has('matches', e.matchId) &&
        b.innings.some((i) => i.id === e.inningsId && i.matchId === e.matchId),
      'Orphan event.',
    );
  for (const a of b.audits)
    must(
      has('matches', a.matchId) && Array.isArray(a.events) && Array.isArray(a.innings),
      'Invalid audit.',
    );
  must(b.drafts.length <= 1, 'Only one active setup draft is supported.');
  for (const d of b.drafts) {
    must(
      Number.isInteger(d.step) &&
        d.step >= 0 &&
        d.step <= 3 &&
        Array.isArray(d.squadA) &&
        Array.isArray(d.squadB) &&
        d.rules &&
        typeof d.date === 'string' &&
        typeof d.venue === 'string',
      'Invalid setup draft.',
    );
    must(
      [d.teamA, d.teamB].every((id) => id === '' || has('teams', id)) &&
        [...d.squadA, ...d.squadB].every((id) => has('players', id)),
      'Broken draft relationships.',
    );
  }
  return b;
}
export async function importBackup(workspaceId, backup) {
  const b = validateBackup(backup);
  await db.transaction(
    'rw',
    db.workspaces,
    ...tables.map((t) => db[t]),
    db.syncMeta,
    db.pendingChanges,
    async () => {
      must(await db.workspaces.get(workspaceId), 'Current workspace missing.');
      const previousMatches = await db.matches.where({ workspaceId }).toArray();
      for (const t of tables) {
        const previous = await db[t].where({ workspaceId }).toArray();
        for (const record of previous)
          await queueSyncChange(workspaceId, t, record.id, record, true);
        await db[t].where({ workspaceId }).delete();
        const imported = b[t].map((record) => ({
          ...record,
          workspaceId,
          ...(t === 'matches'
            ? {
                revision:
                  Math.max(
                    record.revision,
                    previousMatches.find((match) => match.id === record.id)?.revision || 0,
                  ) + 1,
              }
            : {}),
        }));
        await db[t].bulkAdd(imported);
        for (const record of imported)
          await queueSyncChange(workspaceId, t, record.id, record);
      }
      await db.workspaces.put({ ...b.workspace, id: workspaceId });
    },
  );
}
export async function clearWorkspace(workspaceId) {
  await db.transaction(
    'rw',
    db.workspaces,
    ...tables.map((t) => db[t]),
    db.syncMeta,
    db.pendingChanges,
    db.appState,
    async () => {
      const meta = await db.syncMeta.get(workspaceId);
      for (const table of tables) {
        const records = await db[table].where({ workspaceId }).toArray();
        for (const record of records)
          await queueSyncChange(workspaceId, table, record.id, record, true);
        await db[table].where({ workspaceId }).delete();
      }
      if (meta?.teamId) {
        await db.workspaces.put({
          ...(await db.workspaces.get(workspaceId)),
          name: 'Team account',
        });
      } else {
        await db.workspaces.delete(workspaceId);
        const active = await db.appState.get('active-workspace');
        if (active?.workspaceId === workspaceId) await db.appState.delete(active.id);
      }
    },
  );
}
