import { db, tables } from './db.js';

const MAX_BATCH = 250;
const recordKey = (table, recordId) => `${table}:${recordId}`;
const pendingKey = (workspaceId, table, recordId) => `${workspaceId}:${table}:${recordId}`;

export async function fetchSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.authenticated ? data : null;
  } catch {
    return null;
  }
}

export async function getSyncMeta(workspaceId) {
  return db.syncMeta.get(workspaceId);
}

export async function updateSyncMeta(workspaceId, patch) {
  await db.transaction('rw', db.syncMeta, async () => {
    const existing = (await db.syncMeta.get(workspaceId)) ?? { workspaceId, revisions: {} };
    await db.syncMeta.put({ ...existing, ...patch });
  });
}

export async function getPendingCount(workspaceId) {
  return db.pendingChanges.where({ workspaceId }).count();
}

export async function getSyncState(workspaceId) {
  const [meta, pending] = await Promise.all([
    getSyncMeta(workspaceId),
    getPendingCount(workspaceId),
  ]);
  return { meta, pending, conflicts: meta?.conflicts ?? [] };
}

export async function queueChange(workspaceId, table, recordId, data, deleted = false) {
  const meta = await getSyncMeta(workspaceId);
  if (!meta?.teamId) return;
  const id = pendingKey(workspaceId, table, recordId);
  const previous = await db.pendingChanges.get(id);
  await db.pendingChanges.put({
    id,
    changeId: crypto.randomUUID(),
    workspaceId,
    table,
    recordId,
    data: { ...data },
    deleted,
    baseRevision: previous?.baseRevision ?? meta.revisions?.[recordKey(table, recordId)] ?? 0,
    queuedAt: new Date().toISOString(),
  });
  await updateSyncMeta(workspaceId, { syncStatus: 'pending' });
}

function batches(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

export async function pushChanges(workspaceId) {
  const meta = await getSyncMeta(workspaceId);
  if (!meta?.teamId) return { pushed: 0, rejected: [], error: 'This workspace is not linked to a team.' };

  const pending = await db.pendingChanges.where({ workspaceId }).toArray();
  if (pending.length === 0) return { pushed: 0, rejected: [] };
  pending.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));

  let pushed = 0;
  const rejected = [];
  for (const batch of batches(pending, MAX_BATCH)) {
    let result;
    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: batch.map((change) => ({
            table: change.table,
            recordId: change.recordId,
            data: change.data,
            baseRevision: change.baseRevision,
            changeId: change.changeId,
            deleted: change.deleted,
          })),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `Push failed: ${res.status}`);
      }
      result = await res.json();
      if (!Array.isArray(result.applied) || !Array.isArray(result.rejected))
        throw new Error('The sync server returned an invalid push response.');
    } catch (error) {
      await updateSyncMeta(workspaceId, {
        syncStatus: 'pending',
        lastError: error instanceof Error ? error.message : 'Push failed.',
      });
      return { pushed, rejected, error: error.message };
    }

    await db.transaction('rw', db.pendingChanges, db.syncMeta, async () => {
      const currentMeta = (await db.syncMeta.get(workspaceId)) ?? meta;
      const revisions = { ...(currentMeta.revisions ?? {}) };
      const conflicts = [...(currentMeta.conflicts ?? [])];
      for (const applied of result.applied) {
        const change = batch.find(
          (item) => item.recordId === applied.recordId && item.changeId === applied.changeId,
        );
        if (!change || !Number.isInteger(applied.revision)) continue;
        revisions[recordKey(change.table, change.recordId)] = applied.revision;
        const current = await db.pendingChanges.get(change.id);
        if (current?.changeId === change.changeId) await db.pendingChanges.delete(change.id);
        else if (current)
          await db.pendingChanges.put({ ...current, baseRevision: applied.revision });
        const conflictIndex = conflicts.findIndex(
          (item) => item.table === change.table && item.recordId === change.recordId,
        );
        if (conflictIndex !== -1) conflicts.splice(conflictIndex, 1);
        pushed++;
      }
      for (const item of result.rejected) {
        const change = batch.find(
          (entry) => entry.table === item.table && entry.recordId === item.recordId,
        );
        if (!change) continue;
        rejected.push({ ...item, table: change.table, changeId: change.changeId });
        if (item.serverRecord) {
          const conflict = {
            table: change.table,
            recordId: change.recordId,
            changeId: change.changeId,
            serverRecord: item.serverRecord,
            detectedAt: new Date().toISOString(),
          };
          const index = conflicts.findIndex(
            (current) => current.table === change.table && current.recordId === change.recordId,
          );
          if (index === -1) conflicts.push(conflict);
          else conflicts[index] = conflict;
        }
      }
      await db.syncMeta.put({
        ...currentMeta,
        revisions,
        conflicts,
        lastPush: result.pushedAt,
        syncStatus: rejected.length ? 'conflict' : 'pending',
        lastError: null,
      });
    });
  }

  return { pushed, rejected };
}

export async function pullChanges(workspaceId) {
  const meta = await getSyncMeta(workspaceId);
  if (!meta?.teamId) return { merged: 0, error: 'This workspace is not linked to a team.' };
  const priorCursor = meta.lastPull ? Date.parse(meta.lastPull) : 0;
  const since = new Date(Math.max(0, priorCursor - 1000)).toISOString();

  let result;
  try {
    const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(since)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Pull failed: ${res.status}`);
    }
    result = await res.json();
    if (!Array.isArray(result.records) || typeof result.pulledAt !== 'string')
      throw new Error('The sync server returned an invalid pull response.');
  } catch (error) {
    await updateSyncMeta(workspaceId, {
      syncStatus: 'pending',
      lastError: error instanceof Error ? error.message : 'Pull failed.',
    });
    return { merged: 0, error: error.message };
  }

  let merged = 0;
  await db.transaction(
    'rw',
    ...tables.map((table) => db[table]),
    db.pendingChanges,
    db.syncMeta,
    async () => {
      const currentMeta = (await db.syncMeta.get(workspaceId)) ?? meta;
      const revisions = { ...(currentMeta.revisions ?? {}) };
      const conflicts = [...(currentMeta.conflicts ?? [])];
      for (const serverRecord of result.records) {
        const { table, recordId, data, deletedAt, revision, lastChangeId } = serverRecord;
        if (!tables.includes(table) || typeof recordId !== 'string' || !Number.isInteger(revision))
          continue;
        const key = recordKey(table, recordId);
        if (revision <= (revisions[key] ?? 0)) continue;

        const queuedId = pendingKey(workspaceId, table, recordId);
        const pending = await db.pendingChanges.get(queuedId);
        if (pending && pending.changeId === lastChangeId) {
          await db.pendingChanges.delete(queuedId);
          revisions[key] = revision;
          continue;
        }
        if (pending) {
          const conflict = {
            table,
            recordId,
            changeId: pending.changeId,
            serverRecord,
            detectedAt: new Date().toISOString(),
          };
          const index = conflicts.findIndex(
            (item) => item.table === table && item.recordId === recordId,
          );
          if (index === -1) conflicts.push(conflict);
          else conflicts[index] = conflict;
          continue;
        }

        if (deletedAt) await db[table].delete(recordId);
        else if (data && typeof data === 'object')
          await db[table].put({ ...data, id: recordId, workspaceId });
        else continue;
        revisions[key] = revision;
        merged++;
      }
      await db.syncMeta.put({
        ...currentMeta,
        revisions,
        conflicts,
        lastPull: result.pulledAt,
        lastError: null,
      });
    },
  );
  return { merged };
}

export async function resolveConflict(workspaceId, conflict, resolution) {
  await db.transaction(
    'rw',
    ...tables.map((table) => db[table]),
    db.pendingChanges,
    db.syncMeta,
    async () => {
      const meta = await db.syncMeta.get(workspaceId);
      if (!meta) return;
      const current = await db.pendingChanges.get(
        pendingKey(workspaceId, conflict.table, conflict.recordId),
      );
      if (!current || current.changeId !== conflict.changeId) return;
      const conflicts = (meta.conflicts ?? []).filter(
        (item) =>
          item.table !== conflict.table ||
          item.recordId !== conflict.recordId ||
          item.changeId !== conflict.changeId,
      );
      const revisions = { ...(meta.revisions ?? {}) };
      const key = recordKey(conflict.table, conflict.recordId);
      if (resolution === 'remote') {
        if (conflict.serverRecord.deletedAt)
          await db[conflict.table].delete(conflict.recordId);
        else
          await db[conflict.table].put({
            ...conflict.serverRecord.data,
            id: conflict.recordId,
            workspaceId,
          });
        revisions[key] = conflict.serverRecord.revision;
        await db.pendingChanges.delete(current.id);
      } else if (resolution === 'local') {
        current.baseRevision = conflict.serverRecord.revision;
        current.changeId = crypto.randomUUID();
        await db.pendingChanges.put(current);
        revisions[key] = conflict.serverRecord.revision;
      } else {
        throw new Error('Unsupported conflict resolution.');
      }
      await db.syncMeta.put({
        ...meta,
        revisions,
        conflicts,
        syncStatus: conflicts.length || resolution === 'local' ? 'pending' : 'synced',
      });
    },
  );
}

export async function sync(workspaceId) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await updateSyncMeta(workspaceId, { syncStatus: 'offline' });
    return { ok: false, reason: 'offline' };
  }

  const [session, meta] = await Promise.all([fetchSession(), getSyncMeta(workspaceId)]);
  if (!session || !meta?.teamId || (session.workspaceKey || session.teamId) !== meta.teamId) {
    await updateSyncMeta(workspaceId, { syncStatus: 'unauthenticated' });
    return { ok: false, reason: 'unauthenticated', session };
  }

  await updateSyncMeta(workspaceId, { syncStatus: 'syncing', lastError: null });
  const pushResult = await pushChanges(workspaceId);
  const pullResult = await pullChanges(workspaceId);
  const state = await getSyncState(workspaceId);
  const status =
    state.conflicts.length || pushResult.rejected?.length
      ? 'conflict'
      : pushResult.error || pullResult.error
        ? 'attention'
        : state.pending
          ? 'pending'
          : 'synced';
  await updateSyncMeta(workspaceId, {
    syncStatus: status,
    ...(status === 'synced' ? { lastSuccessfulSync: new Date().toISOString(), lastError: null } : {}),
  });
  return {
    ok: status === 'synced',
    pushed: pushResult.pushed,
    merged: pullResult.merged,
    status,
    error: pushResult.error || pullResult.error || null,
    session,
  };
}

export async function logoutTeamSession() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Sign out failed. Please try again.');
}

export async function acquireScoringLock(matchId, deviceName) {
  const res = await fetch('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'acquire', deviceName }),
  });
  return res.json();
}

export async function releaseScoringLock(matchId) {
  await fetch('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'release' }),
  }).catch(() => {});
}

export async function heartbeatScoringLock(matchId) {
  await fetch('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'heartbeat' }),
  }).catch(() => {});
}

export async function takeoverScoringLock(matchId, deviceName) {
  const res = await fetch('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'takeover', deviceName }),
  });
  return res.json();
}

export async function getLockStatus(matchId) {
  const res = await fetch(`/api/sync/lock?matchId=${encodeURIComponent(matchId)}`, {
    credentials: 'include',
  });
  if (!res.ok) return { locked: false };
  return res.json();
}
