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
  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    accountKey: meta?.teamId,
    activeWorkspaceMatches: active?.workspaceId === workspaceId,
    activeAccountMatches: active?.teamId === meta?.teamId,
    pending: pending.length,
    counts,
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
