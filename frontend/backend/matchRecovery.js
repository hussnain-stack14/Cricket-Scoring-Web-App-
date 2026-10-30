import { createHash } from 'node:crypto';
import { matchStates, overs, result } from '../lib/engine.js';

const RECOVERY_TABLES = ['matches', 'innings', 'events'];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function accountShape(record, { match = false } = {}) {
  const copy = structuredClone(record);
  delete copy.workspaceId;
  // Legacy local tombstones copied this lifecycle field into record data. The authoritative
  // tombstone state is SyncRecord.deletedAt and is checked separately by the recovery plan.
  delete copy.deletedAt;
  if (match) {
    delete copy.syncSnapshot;
    delete copy.completionPending;
  }
  return copy;
}

export function recoveryFingerprint(history) {
  const source = {
    match: accountShape(history.match, { match: true }),
    innings: [...history.innings]
      .map((row) => accountShape(row))
      .sort((a, b) => a.id.localeCompare(b.id)),
    events: [...history.events].map((row) => accountShape(row)).sort((a, b) => a.seq - b.seq),
  };
  return createHash('sha256')
    .update(JSON.stringify(stable(source)))
    .digest('hex');
}

function sameRecord(table, backupRecord, cloudRecord) {
  return (
    JSON.stringify(stable(accountShape(backupRecord, { match: table === 'matches' }))) ===
    JSON.stringify(stable(accountShape(cloudRecord.data, { match: table === 'matches' })))
  );
}

function changedKeys(table, backupRecord, cloudRecord) {
  const backup = accountShape(backupRecord, { match: table === 'matches' });
  const cloud = accountShape(cloudRecord.data, { match: table === 'matches' });
  return [...new Set([...Object.keys(backup), ...Object.keys(cloud)])]
    .filter((key) => JSON.stringify(stable(backup[key])) !== JSON.stringify(stable(cloud[key])))
    .sort();
}

export function validateRecoveryHistory(history, { expectedEvents = 301 } = {}) {
  const errors = [];
  const { match, innings = [], events = [] } = history ?? {};
  if (!match?.id) errors.push('The backup does not contain the match record.');
  if (innings.length !== 2) errors.push('Recovery requires exactly two innings records.');
  if (events.length !== expectedEvents)
    errors.push(`Recovery requires exactly ${expectedEvents} scoring events.`);
  const inningsIds = new Set(innings.map((row) => row.id));
  if (innings.some((row) => row.matchId !== match?.id))
    errors.push('An innings belongs to another match.');
  if (events.some((row) => row.matchId !== match?.id))
    errors.push('A scoring event belongs to another match.');
  if (events.some((row) => !inningsIds.has(row.inningsId)))
    errors.push('A scoring event is not linked to either recovered innings.');
  if (new Set(events.map((row) => row.id)).size !== events.length)
    errors.push('The backup has duplicate scoring-event IDs.');
  if (new Set(events.map((row) => row.seq)).size !== events.length)
    errors.push('The backup has duplicate scoring-event sequence values.');
  const ordered = [...events].map((row) => row.seq).sort((a, b) => a - b);
  if (ordered.some((seq, index) => !Number.isInteger(seq) || seq !== index + 1))
    errors.push('Scoring-event sequence values are not contiguous from 1.');

  let replay = null;
  if (!errors.length) {
    try {
      const states = matchStates(match, innings, events);
      replay = {
        innings: states.map((state, index) => ({
          number: index + 1,
          runs: state.runs,
          wickets: state.wickets,
          overs: overs(state.balls),
          completed: Boolean(state.done),
          extras: state.extras,
        })),
        result: result(match, states),
      };
      if (states.length !== 2 || !states.every((state) => state.done))
        errors.push('The delivery history does not complete both innings.');
    } catch {
      errors.push('The delivery history cannot be replayed by the scoring engine.');
    }
  }
  return { valid: !errors.length, errors, replay };
}

export function planMatchRecovery(history, cloudRecords, options = {}) {
  const validation = validateRecoveryHistory(history, options);
  const expected = [
    { table: 'matches', record: history.match },
    ...history.innings.map((record) => ({ table: 'innings', record })),
    ...history.events.map((record) => ({ table: 'events', record })),
  ];
  const cloudByKey = new Map(
    cloudRecords.map((record) => [`${record.table}:${record.recordId}`, record]),
  );
  const actions = [];
  const conflicts = [];
  for (const { table, record } of expected) {
    if (!record?.id) {
      conflicts.push({ table, recordId: null, reason: 'Backup record is missing an ID.' });
      continue;
    }
    const cloud = cloudByKey.get(`${table}:${record.id}`);
    if (!cloud) {
      actions.push({ table, recordId: record.id, action: 'create', baseRevision: 0 });
    } else if (!sameRecord(table, record, cloud)) {
      conflicts.push({
        table,
        recordId: record.id,
        reason: 'Atlas contains a different payload for this stable record ID.',
        changedFields: changedKeys(table, record, cloud),
        revision: cloud.revision,
        tombstoned: Boolean(cloud.deletedAt),
      });
    } else if (cloud.deletedAt) {
      actions.push({ table, recordId: record.id, action: 'restore', baseRevision: cloud.revision });
    } else {
      actions.push({
        table,
        recordId: record.id,
        action: 'unchanged',
        baseRevision: cloud.revision,
      });
    }
  }
  const expectedKeys = new Set(expected.map(({ table, record }) => `${table}:${record?.id}`));
  const unexpectedActive = cloudRecords
    .filter(
      (record) =>
        !record.deletedAt &&
        ['innings', 'events'].includes(record.table) &&
        !expectedKeys.has(`${record.table}:${record.recordId}`),
    )
    .map((record) => ({
      table: record.table,
      recordId: record.recordId,
      revision: record.revision,
    }));
  if (unexpectedActive.length)
    conflicts.push(
      ...unexpectedActive.map((record) => ({ ...record, reason: 'Unexpected active child.' })),
    );

  return {
    validation,
    actions,
    conflicts,
    fingerprint: validation.valid ? recoveryFingerprint(history) : null,
    ready: validation.valid && !conflicts.length,
  };
}

export function recoveredCompletedMatch(match, eventCount) {
  const {
    completionPending: _pending,
    syncSnapshot: _snapshot,
    ...base
  } = accountShape(match, {
    match: true,
  });
  return {
    ...base,
    status: 'completed',
    syncSnapshot: { innings: 2, events: eventCount, verified: true },
  };
}

export { RECOVERY_TABLES };
