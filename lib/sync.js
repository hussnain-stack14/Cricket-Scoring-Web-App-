import Dexie from 'dexie';
import { db, tables } from './db';

// ─── IndexedDB v3 — additive migration ───────────────────────────────────────
// Adds syncMeta (one row per workspace) and pendingChanges (outbound change queue).
// All v1/v2 records are preserved untouched.
db.version(3).stores({
  syncMeta: 'workspaceId',
  pendingChanges: 'id, workspaceId, table, recordId, syncedAt',
});

// ─── Session check ────────────────────────────────────────────────────────────
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

// ─── Sync metadata ────────────────────────────────────────────────────────────
export async function getSyncMeta(workspaceId) {
  return db.syncMeta.get(workspaceId);
}

export async function updateSyncMeta(workspaceId, patch) {
  const existing = (await db.syncMeta.get(workspaceId)) ?? { workspaceId };
  await db.syncMeta.put({ ...existing, ...patch });
}

// ─── Queue a local change for later sync ─────────────────────────────────────
export async function queueChange(workspaceId, table, recordId, data, deleted = false) {
  await db.pendingChanges.put({
    id: crypto.randomUUID(),
    workspaceId,
    table,
    recordId,
    data,
    deleted,
    queuedAt: new Date().toISOString(),
    syncedAt: null,
  });
  await updateSyncMeta(workspaceId, { syncStatus: 'pending' });
}

// ─── Push pending changes to server ──────────────────────────────────────────
export async function pushChanges(workspaceId) {
  const pending = await db.pendingChanges
    .where({ workspaceId })
    .filter((c) => !c.syncedAt)
    .toArray();

  if (pending.length === 0) return { pushed: 0, rejected: [] };

  // Deduplicate: only latest change per record (server only needs current state)
  const byRecord = new Map();
  for (const change of pending) {
    byRecord.set(`${change.table}:${change.recordId}`, change);
  }
  const batch = [...byRecord.values()];

  let result;
  try {
    const res = await fetch('/api/sync/push', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: batch.map((c) => ({
          table: c.table,
          recordId: c.recordId,
          data: c.data,
          revision: c.data?.revision ?? 0,
          deletedAt: c.deleted ? new Date().toISOString() : null,
        })),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Push failed: ${res.status}`);
    }
    result = await res.json();
  } catch (err) {
    await updateSyncMeta(workspaceId, { syncStatus: 'pending', lastError: err.message });
    return { pushed: 0, rejected: [], error: err.message };
  }

  // Mark applied changes as synced
  const appliedIds = new Set(result.applied.map((a) => a.recordId));
  await db.transaction('rw', db.pendingChanges, db.syncMeta, async () => {
    for (const change of batch) {
      if (appliedIds.has(change.recordId)) {
        await db.pendingChanges.where({ workspaceId }).filter((c) => c.id === change.id).delete();
      }
    }
    const stillPending = await db.pendingChanges
      .where({ workspaceId })
      .filter((c) => !c.syncedAt)
      .count();
    await updateSyncMeta(workspaceId, {
      lastPush: result.pushedAt,
      syncStatus: stillPending > 0 ? 'pending' : 'synced',
      lastError: null,
    });
  });

  return { pushed: result.applied.length, rejected: result.rejected };
}

// ─── Pull server changes into IndexedDB ──────────────────────────────────────
export async function pullChanges(workspaceId) {
  const meta = await getSyncMeta(workspaceId);
  const since = meta?.lastPull ?? new Date(0).toISOString();

  let result;
  try {
    const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(since)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Pull failed: ${res.status}`);
    }
    result = await res.json();
  } catch (err) {
    await updateSyncMeta(workspaceId, { lastError: err.message });
    return { merged: 0, error: err.message };
  }

  if (!result.records?.length) {
    await updateSyncMeta(workspaceId, { lastPull: result.pulledAt, lastError: null });
    return { merged: 0 };
  }

  // Merge server records into local IndexedDB
  let merged = 0;
  await db.transaction('rw', ...tables.map((t) => db[t]), db.syncMeta, async () => {
    for (const serverRecord of result.records) {
      const { table, recordId, data, deletedAt } = serverRecord;
      if (!tables.includes(table) || !data) continue;

      const localRecord = await db[table].get(recordId);

      if (deletedAt) {
        // Server deleted this record — remove locally too
        if (localRecord) await db[table].delete(recordId);
      } else {
        // Server wins: overwrite local record with server state
        // (safe: client changes are pushed before pull in the full sync cycle)
        await db[table].put({ ...data, workspaceId });
      }
      merged++;
    }
    await updateSyncMeta(workspaceId, { lastPull: result.pulledAt, lastError: null });
  });

  return { merged };
}

// ─── Full sync cycle: push then pull ─────────────────────────────────────────
export async function sync(workspaceId) {
  if (!navigator.onLine) {
    await updateSyncMeta(workspaceId, { syncStatus: 'offline' });
    return { ok: false, reason: 'offline' };
  }

  const session = await fetchSession();
  if (!session) {
    await updateSyncMeta(workspaceId, { syncStatus: 'unauthenticated' });
    return { ok: false, reason: 'unauthenticated' };
  }

  await updateSyncMeta(workspaceId, { syncStatus: 'syncing', teamId: session.teamId });

  const pushResult = await pushChanges(workspaceId);
  const pullResult = await pullChanges(workspaceId);

  const status =
    pushResult.rejected?.length > 0 ? 'conflict' :
    pushResult.error || pullResult.error ? 'pending' :
    'synced';

  await updateSyncMeta(workspaceId, { syncStatus: status });
  return { ok: true, pushed: pushResult.pushed, merged: pullResult.merged, status };
}

// ─── Scoring lock ─────────────────────────────────────────────────────────────
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
  }).catch(() => {}); // Best-effort release
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
