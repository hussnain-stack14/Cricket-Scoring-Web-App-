import { db, tables } from './db.js';
import { fetchWithTimeout } from './request.js';

const MAX_BATCH = 250;
const SESSION_TIMEOUT_MS = 4000;
const recordKey = (table, recordId) => `${table}:${recordId}`;
const pendingKey = (workspaceId, table, recordId) => `${workspaceId}:${table}:${recordId}`;
let sessionRequest;
const syncJobs = new Map();

export async function fetchSession({ timeoutMs = SESSION_TIMEOUT_MS } = {}) {
  if (sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    const res = await fetchWithTimeout('/api/auth/me', { credentials: 'include' }, timeoutMs);
    if (res.status === 401) return null;
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw Object.assign(new Error(result.error || `Session check failed: ${res.status}`), {
        status: res.status,
      });
    }
    const data = await res.json();
    return data.authenticated ? data : null;
  })();
  try {
    return await sessionRequest;
  } finally {
    sessionRequest = null;
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
  if (meta.signOutLock?.expiresAt > Date.now())
    throw new Error('Sign out is in progress. Finish or cancel it before changing team data.');
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
  if (!meta?.teamId)
    return { pushed: 0, rejected: [], error: 'This workspace is not linked to a team.' };

  const pending = await db.pendingChanges.where({ workspaceId }).toArray();
  if (pending.length === 0) return { pushed: 0, rejected: [] };
  pending.sort(
    (left, right) =>
      Number(right.table === 'matches') - Number(left.table === 'matches') ||
      left.queuedAt.localeCompare(right.queuedAt),
  );

  let pushed = 0;
  const rejected = [];
  for (const batch of batches(pending, MAX_BATCH)) {
    let result;
    try {
      const res = await fetchWithTimeout('/api/sync/push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Crease-Workspace': meta.teamId },
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
        throw Object.assign(
          new Error(error.error || `Sync service unavailable (${res.status}). Retry shortly.`),
          { status: res.status },
        );
      }
      result = await res.json();
      if (!Array.isArray(result.applied) || !Array.isArray(result.rejected))
        throw new Error('The sync server returned an invalid push response.');
    } catch (error) {
      await updateSyncMeta(workspaceId, {
        syncStatus: 'pending',
        lastError: error instanceof Error ? error.message : 'Push failed.',
      });
      return { pushed, rejected, error: error.message, httpStatus: error.status };
    }

    await db.transaction('rw', db.pendingChanges, db.syncMeta, async () => {
      const currentMeta = (await db.syncMeta.get(workspaceId)) ?? meta;
      const revisions = { ...(currentMeta.revisions ?? {}) };
      const conflicts = [...(currentMeta.conflicts ?? [])];
      for (const applied of result.applied) {
        const change = batch.find(
          (item) =>
            item.table === applied.table &&
            item.recordId === applied.recordId &&
            item.changeId === applied.changeId,
        );
        if (
          !change ||
          !Number.isInteger(applied.revision) ||
          applied.revision <= change.baseRevision
        )
          continue;
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
          (entry) =>
            entry.table === item.table &&
            entry.recordId === item.recordId &&
            (!item.changeId || entry.changeId === item.changeId),
        );
        if (!change) continue;
        const reason =
          typeof item.reason === 'string' && item.reason.trim()
            ? item.reason.trim()
            : 'The server rejected this change without providing a reason.';
        rejected.push({ ...item, reason, table: change.table, changeId: change.changeId });
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
        lastError: rejected[0]?.reason || null,
        rejections: rejected.map(({ table, recordId, reason }) => ({ table, recordId, reason })),
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
    const res = await fetchWithTimeout(`/api/sync/pull?since=${encodeURIComponent(since)}`, {
      credentials: 'include',
      headers: { 'X-Crease-Workspace': meta.teamId },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw Object.assign(
        new Error(error.error || `Sync service unavailable (${res.status}). Retry shortly.`),
        { status: res.status },
      );
    }
    result = await res.json();
    if (!Array.isArray(result.records) || typeof result.pulledAt !== 'string')
      throw new Error('The sync server returned an invalid pull response.');
  } catch (error) {
    await updateSyncMeta(workspaceId, {
      syncStatus: 'pending',
      lastError: error instanceof Error ? error.message : 'Pull failed.',
    });
    return { merged: 0, error: error.message, httpStatus: error.status };
  }

  let merged = 0;
  let deferredMatchRecords = false;
  await db.transaction(
    'rw',
    ...tables.map((table) => db[table]),
    db.pendingChanges,
    db.syncMeta,
    async () => {
      const currentMeta = (await db.syncMeta.get(workspaceId)) ?? meta;
      const revisions = { ...(currentMeta.revisions ?? {}) };
      const conflicts = [...(currentMeta.conflicts ?? [])];
      for (const serverRecord of [...result.records].sort(
        (a, b) => Number(b.table === 'matches') - Number(a.table === 'matches'),
      )) {
        const { table, recordId, data, deletedAt, revision, lastChangeId } = serverRecord;
        if (!tables.includes(table) || typeof recordId !== 'string' || !Number.isInteger(revision))
          continue;
        if (['innings', 'events'].includes(table) && data?.matchId) {
          const parent = await db.matches.get(data.matchId);
          if ((parent?.startId || data.startId) && parent?.startId !== data.startId) {
            deferredMatchRecords = true;
            continue;
          }
        }
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
        lastPull: deferredMatchRecords ? currentMeta.lastPull : result.pulledAt,
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
      if (
        conflict.table === 'matches' &&
        current.data?.startId &&
        conflict.serverRecord.data?.startId &&
        current.data.startId !== conflict.serverRecord.data.startId
      )
        throw new Error(
          'Two devices started this match independently. Both versions are preserved. Export a backup and review the starts before resolving; automatic replacement is blocked.',
        );
      const conflicts = (meta.conflicts ?? []).filter(
        (item) =>
          item.table !== conflict.table ||
          item.recordId !== conflict.recordId ||
          item.changeId !== conflict.changeId,
      );
      const revisions = { ...(meta.revisions ?? {}) };
      const key = recordKey(conflict.table, conflict.recordId);
      if (resolution === 'remote') {
        if (conflict.serverRecord.deletedAt) await db[conflict.table].delete(conflict.recordId);
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

export function sync(workspaceId, options = {}) {
  if (syncJobs.has(workspaceId)) return syncJobs.get(workspaceId);
  const job = performSync(workspaceId, options).finally(() => {
    if (syncJobs.get(workspaceId) === job) syncJobs.delete(workspaceId);
  });
  syncJobs.set(workspaceId, job);
  return job;
}
async function performSync(workspaceId, { signOutToken, session: knownSession } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await updateSyncMeta(workspaceId, { syncStatus: 'offline' });
    return { ok: false, status: 'offline', reason: 'offline' };
  }

  const lock = await acquireSyncLock(workspaceId, signOutToken);
  if (!lock)
    return {
      ok: false,
      status: 'attention',
      reason: 'sync-in-progress',
      error: 'Another synchronization is already in progress.',
    };
  const heartbeat = globalThis.setInterval(() => {
    void renewSyncLock(workspaceId, lock).catch((error) => {
      console.error('Could not renew the synchronization lock:', error);
    });
  }, 20_000);

  try {
    let session = knownSession;
    let meta;
    try {
      [session, meta] = await Promise.all([
        session ? Promise.resolve(session) : fetchSession(),
        getSyncMeta(workspaceId),
      ]);
    } catch (error) {
      await updateSyncMeta(workspaceId, {
        syncStatus: 'attention',
        lastError: error instanceof Error ? error.message : 'Session check failed.',
      });
      return {
        ok: false,
        status: 'attention',
        reason: 'network',
        error: error instanceof Error ? error.message : 'Session check failed.',
      };
    }
    if (!session || !meta?.teamId || (session.workspaceKey || session.teamId) !== meta.teamId) {
      await updateSyncMeta(workspaceId, { syncStatus: 'unauthenticated' });
      return {
        ok: false,
        status: 'unauthenticated',
        reason: 'unauthenticated',
        session,
        error: 'Sign in to the same account again. Your changes are still saved on this device.',
      };
    }

    await updateSyncMeta(workspaceId, { syncStatus: 'syncing', lastError: null });
    const pushResult = await pushChanges(workspaceId);
    const pullResult = pushResult.error ? { merged: 0 } : await pullChanges(workspaceId);
    const state = await getSyncState(workspaceId);
    const status = [401, 409].includes(pushResult.httpStatus || pullResult.httpStatus)
      ? 'unauthenticated'
      : state.conflicts.length || pushResult.rejected?.length
        ? 'conflict'
        : pushResult.error || pullResult.error
          ? 'attention'
          : state.pending
            ? 'pending'
            : 'synced';
    await updateSyncMeta(workspaceId, {
      syncStatus: status,
      lastError: pushResult.error || pullResult.error || pushResult.rejected?.[0]?.reason || null,
      ...(status === 'synced'
        ? { lastSuccessfulSync: new Date().toISOString(), lastError: null }
        : {}),
    });
    return {
      ok: status === 'synced',
      pushed: pushResult.pushed,
      merged: pullResult.merged,
      status,
      error: pushResult.error || pullResult.error || pushResult.rejected?.[0]?.reason || null,
      session: status === 'unauthenticated' ? null : session,
    };
  } finally {
    globalThis.clearInterval(heartbeat);
    await releaseSyncLock(workspaceId, lock);
  }
}

export async function logoutTeamSession(workspaceId) {
  const meta = workspaceId ? await getSyncMeta(workspaceId) : null;
  const response = await fetchWithTimeout('/api/auth/logout', {
    method: 'POST',
    headers: meta?.teamId ? { 'X-Crease-Workspace': meta.teamId } : {},
    credentials: 'include',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Sign out failed. Please try again.');
  }
}

export async function beginSignOut(workspaceId) {
  if (syncJobs.has(workspaceId)) await syncJobs.get(workspaceId);
  const token = crypto.randomUUID();
  await db.transaction('rw', db.syncMeta, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (!meta?.teamId) throw new Error('This account workspace is not available on this device.');
    if (meta.syncLock?.expiresAt > Date.now())
      throw new Error('Synchronization is still running in another tab. Retry sign out shortly.');
    if (meta.signOutLock?.expiresAt > Date.now())
      throw new Error('Sign out is already in progress in another tab.');
    await db.syncMeta.put({
      ...meta,
      signOutLock: { id: token, expiresAt: Date.now() + 60_000 },
    });
  });
  return token;
}

async function acquireSyncLock(workspaceId, signOutToken) {
  const lockId = crypto.randomUUID();
  return db.transaction('rw', db.syncMeta, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (!meta?.teamId) return null;
    if (meta.syncLock?.expiresAt > Date.now()) return null;
    if (meta.signOutLock?.expiresAt > Date.now() && meta.signOutLock.id !== signOutToken)
      return null;
    if (signOutToken && meta.signOutLock?.id !== signOutToken) return null;
    await db.syncMeta.put({
      ...meta,
      syncLock: { id: lockId, expiresAt: Date.now() + 60_000 },
    });
    return lockId;
  });
}

async function renewSyncLock(workspaceId, lockId) {
  await db.transaction('rw', db.syncMeta, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (meta?.syncLock?.id !== lockId) return;
    await db.syncMeta.put({
      ...meta,
      syncLock: { id: lockId, expiresAt: Date.now() + 60_000 },
    });
  });
}

async function releaseSyncLock(workspaceId, lockId) {
  await db.transaction('rw', db.syncMeta, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (meta?.syncLock?.id !== lockId) return;
    const { syncLock: _syncLock, ...rest } = meta;
    await db.syncMeta.put(rest);
  });
}

export async function renewSignOut(workspaceId, token) {
  return db.transaction('rw', db.syncMeta, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (meta?.signOutLock?.id !== token) return false;
    await db.syncMeta.put({
      ...meta,
      signOutLock: { id: token, expiresAt: Date.now() + 60_000 },
    });
    return true;
  });
}

export async function cancelSignOut(workspaceId, token) {
  await db.transaction('rw', db.syncMeta, db.pendingChanges, async () => {
    const meta = await db.syncMeta.get(workspaceId);
    if (meta?.signOutLock?.id !== token) return;
    const { signOutLock: _signOutLock, ...rest } = meta;
    const pending = await db.pendingChanges.where({ workspaceId }).count();
    const status = meta.conflicts?.length ? 'conflict' : pending ? 'pending' : meta.syncStatus;
    await db.syncMeta.put({ ...rest, syncStatus: status });
  });
}

export async function acquireScoringLock(matchId, deviceName) {
  const res = await fetchWithTimeout('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'acquire', deviceName }),
  });
  return res.json();
}

export async function releaseScoringLock(matchId) {
  await fetchWithTimeout('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'release' }),
  }).catch(() => {});
}

export async function heartbeatScoringLock(matchId) {
  await fetchWithTimeout('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'heartbeat' }),
  }).catch(() => {});
}

export async function takeoverScoringLock(matchId, deviceName) {
  const res = await fetchWithTimeout('/api/sync/lock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action: 'takeover', deviceName }),
  });
  return res.json();
}

export async function getLockStatus(matchId) {
  const res = await fetchWithTimeout(`/api/sync/lock?matchId=${encodeURIComponent(matchId)}`, {
    credentials: 'include',
  });
  if (!res.ok) return { locked: false };
  return res.json();
}
