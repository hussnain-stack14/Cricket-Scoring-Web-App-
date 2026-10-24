import { db, tables } from './db.js';
// Read-only: no payloads, credentials, or cross-account records in the report.
export async function inspectSync(workspaceId) {
  const meta = await db.syncMeta.get(workspaceId);
  const active = await db.appState.get('active-workspace');
  const pending = await db.pendingChanges.where({ workspaceId }).toArray();
  const counts = {};
  for (const table of tables) {
    const records = await db[table].where({ workspaceId }).toArray();
    counts[table] = { stored: records.length, visible: records.filter((r) => !r.deletedAt).length };
  }
  const keys = new Set();
  const operations = [];
  for (const change of pending) {
    const key = change.table + ':' + change.recordId;
    const record = tables.includes(change.table)
      ? await db[change.table].get(change.recordId)
      : null;
    operations.push({
      table: change.table,
      recordId: change.recordId,
      deleted: change.deleted,
      baseRevision: change.baseRevision,
      queuedAt: change.queuedAt,
      duplicate: keys.has(key),
      localRecordPresent: !!record,
      ownershipMismatch: !!record && record.workspaceId !== workspaceId,
    });
    keys.add(key);
  }
  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    accountKey: meta?.teamId,
    activeWorkspaceMatches: active?.workspaceId === workspaceId,
    activeAccountMatches: active?.teamId === meta?.teamId,
    pending: pending.length,
    counts,
    operations,
    lastError: meta?.lastError,
    rejections: meta?.rejections || [],
    conflicts: (meta?.conflicts || []).map((c) => ({ table: c.table, recordId: c.recordId })),
    note: 'A missing local record can be a legitimate queued deletion. This report does not discard or deduplicate operations.',
  };
}
