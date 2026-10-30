import { db, tables } from './db.js';

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

async function recordFingerprint(table, recordId) {
  if (typeof table !== 'string' || typeof recordId !== 'string' || !globalThis.crypto?.subtle)
    return null;
  const bytes = new TextEncoder().encode(`${table}:${recordId}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function summarizeMatch(match, innings, events) {
  return {
    matchId: match.id,
    status: match.status,
    revision: match.revision ?? 0,
    updatedAt: match.updatedAt || null,
    completedAt: match.completedAt || null,
    syncSnapshot: match.syncSnapshot || null,
    inningsRecords: innings.length,
    eventRecords: events.length,
  };
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
  const pendingByType = Object.fromEntries(tables.map((table) => [table, 0]));
  const recordsById = new Map(
    tables.flatMap((table, index) =>
      recordsByTable[index].map((record) => [`${table}:${record.id}`, record]),
    ),
  );
  const operations = await Promise.all(
    pending.map(async (change) => {
      pendingByType[change.table] = (pendingByType[change.table] || 0) + 1;
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
        operationId: typeof change.changeId === 'string' ? change.changeId.slice(0, 8) : null,
        // Opaque IDs are required to reconcile a specific conflict; no record content is exported.
        recordId: change.recordId,
        recordFingerprint: await recordFingerprint(change.table, change.recordId),
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
        queuedAt: change.queuedAt || null,
        baseRevision: Number.isInteger(change.baseRevision) ? change.baseRevision : null,
      };
    }),
  );
  const matchRecords = recordsByTable[tables.indexOf('matches')].filter(
    (match) => !match.deletedAt,
  );
  const inningsRecords = recordsByTable[tables.indexOf('innings')];
  const eventRecords = recordsByTable[tables.indexOf('events')];
  const matches = matchRecords.map((match) =>
    summarizeMatch(
      match,
      inningsRecords.filter((record) => record.matchId === match.id && !record.deletedAt),
      eventRecords.filter((record) => record.matchId === match.id && !record.deletedAt),
    ),
  );
  return {
    diagnosticSchema: 2,
    generatedAt: new Date().toISOString(),
    workspaceId,
    accountKey: meta?.teamId,
    activeWorkspaceMatches: active?.workspaceId === workspaceId,
    activeAccountMatches: active?.teamId === meta?.teamId,
    pending: pending.length,
    pendingByType,
    queueWindow: {
      earliestQueuedAt: pending.reduce(
        (earliest, change) =>
          !earliest || change.queuedAt < earliest ? change.queuedAt : earliest,
        null,
      ),
      latestQueuedAt: pending.reduce(
        (latest, change) => (!latest || change.queuedAt > latest ? change.queuedAt : latest),
        null,
      ),
    },
    cursor: {
      lastPull: meta?.lastPull || null,
      lastPush: meta?.lastPush || null,
      lastSuccessfulSync: meta?.lastSuccessfulSync || null,
    },
    upload: {
      lastAttempt: meta?.lastUploadAttempt || null,
      lastBatchSize: meta?.lastUploadBatchSize || null,
      lastHttpStatus: meta?.lastHttpStatus || null,
    },
    cloudRevisions: {
      trackedRecords: Object.keys(meta?.revisions || {}).length,
      highestRevision: Math.max(
        0,
        ...Object.values(meta?.revisions || {}).filter(Number.isInteger),
      ),
    },
    counts,
    matches,
    operations,
    lastError: sanitizeReason(meta?.lastError),
    rejections: (meta?.rejections || []).map((item) => ({
      table: item.table,
      reason: sanitizeReason(item.reason),
    })),
    conflictCount: (meta?.conflicts || []).length,
    conflicts: await Promise.all(
      (meta?.conflicts || []).map(async (conflict) => ({
        table: conflict.table,
        recordId: conflict.recordId,
        recordFingerprint: await recordFingerprint(conflict.table, conflict.recordId),
      })),
    ),
    note: 'A missing local record can be a legitimate queued deletion. This report does not discard or deduplicate operations.',
  };
}
