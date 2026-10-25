import { db, tables } from './db.js';

import { matchStates, overs } from './engine.js';

function sanitizeReason(reason) {
  if (typeof reason !== 'string') return null;
  return (
    reason
      .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\b(password|token|cookie|secret|authorization)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 180) || null
  );
}

function summarizeMatch(match, innings, events) {
  const summary = { matchId: match.id, status: match.status, revision: match.revision ?? 0, updatedAt: match.updatedAt || null, completedAt: match.completedAt || null, syncSnapshot: match.syncSnapshot || null, inningsRecords: innings.length, eventRecords: events.length, scores: [] };
  try {
    summary.scores = matchStates(match, innings, events).map((state, index) => ({ innings: index + 1, runs: state.runs, wickets: state.wickets, overs: overs(state.balls), completed: Boolean(state.done) }));
  } catch (error) {
    summary.replayError = sanitizeReason(error instanceof Error ? error.message : String(error));
  }
  return summary;
}

// Read-only: no payloads, credentials, or cross-account records in the report.
export async function inspectSync(workspaceId) {
  const [meta, active, pending, recordsByTable] = await Promise.all([
    db.syncMeta.get(workspaceId),
    db.appState.get('active-workspace'),
    db.pendingChanges.where({ workspaceId }).toArray(),
    Promise.all(tables.map((table) => db[table].where({ workspaceId }).toArray())),
  ]);
  const counts = {};
  for (const [index, table] of tables.entries()) {
    const records = recordsByTable[index];
    counts[table] = { stored: records.length, visible: records.filter((r) => !r.deletedAt).length };
  }
  const keys = new Set();
  const recordsById = new Map(
    tables.flatMap((table, index) =>
      recordsByTable[index].map((record) => [`${table}:${record.id}`, record]),
    ),
  );
  const operations = pending.map((change) => {
    const key = change.table + ':' + change.recordId;
    const duplicate = keys.has(key);
    keys.add(key);
    const record = recordsById.get(key);
    const rejection = (meta?.rejections || []).find(
      (item) => item.table === change.table && item.recordId === change.recordId,
    );
    const conflict = (meta?.conflicts || []).some(
      (item) => item.table === change.table && item.recordId === change.recordId,
    );
    return {
      operationType: change.deleted ? 'delete' : change.baseRevision === 0 ? 'create' : 'update',
      recordType: change.table,
      status: rejection
        ? 'rejected'
        : conflict
          ? 'conflict'
          : meta?.syncStatus === 'syncing'
            ? 'syncing'
            : 'pending',
      failureReason: sanitizeReason(
        rejection?.reason || (conflict ? 'Resolve this sync conflict.' : null),
      ),
      accountKey: meta?.teamId || null,
      workspaceId,
      duplicate,
      localRecordPresent: !!record,
      ownershipMismatch: !!record && record.workspaceId !== workspaceId,
    };
  });
  const matchRecords = recordsByTable[tables.indexOf('matches')].filter((match) => !match.deletedAt);
  const inningsRecords = recordsByTable[tables.indexOf('innings')];
  const eventRecords = recordsByTable[tables.indexOf('events')];
  const matches = matchRecords.map((match) => summarizeMatch(match, inningsRecords.filter((record) => record.matchId === match.id && !record.deletedAt), eventRecords.filter((record) => record.matchId === match.id && !record.deletedAt)));
  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    accountKey: meta?.teamId,
    activeWorkspaceMatches: active?.workspaceId === workspaceId,
    activeAccountMatches: active?.teamId === meta?.teamId,
    pending: pending.length,
    cursor: { lastPull: meta?.lastPull || null, lastPush: meta?.lastPush || null, lastSuccessfulSync: meta?.lastSuccessfulSync || null },
    counts,
    matches,
    operations,
    lastError: sanitizeReason(meta?.lastError),
    rejections: (meta?.rejections || []).map((item) => ({
      table: item.table,
      reason: sanitizeReason(item.reason),
    })),
    conflicts: (meta?.conflicts || []).map((c) => ({ table: c.table, recordId: c.recordId })),
    note: 'A missing local record can be a legitimate queued deletion. This report does not discard or deduplicate operations.',
  };
}
