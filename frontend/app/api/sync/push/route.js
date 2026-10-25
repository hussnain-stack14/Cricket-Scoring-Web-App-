import { isConsumedDraft, syncPolicyError } from '../../../../backend/syncPolicy.js';
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncRecord } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';
import { completedHistoryError } from '../../../../backend/completedHistory.js';
import { reportOperationalEvent } from '../../../../backend/monitoring.js';

const ALLOWED_TABLES = new Set([
  'players',
  'teams',
  'memberships',
  'matches',
  'innings',
  'events',
  'audits',
  'drafts',
]);
const MAX_BATCH = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const syncPriority = (change) => {
  if (change?.table !== 'matches')
    return ['innings', 'events', 'audits'].includes(change?.table) ? 1 : 0;
  return change?.data?.status === 'completed' ? 2 : 0;
};

function publicRecord(record) {
  return record
    ? {
        table: record.table,
        recordId: record.recordId,
        data: record.data,
        revision: record.revision,
        lastChangeId: record.lastChangeId,
        deletedAt: record.deletedAt,
        updatedAt: record.updatedAt,
      }
    : null;
}

function conflict(change, serverRecord, reason) {
  return {
    table: change.table,
    recordId: change.recordId,
    reason,
    serverRecord: publicRecord(serverRecord),
  };
}

/** POST /api/sync/push — all data is namespaced by the authenticated team. */
export async function POST(req) {
  const response = NextResponse.json(null);
  const session = await getIronSession(req, response, getSessionOptions());
  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to sync your data.' }, { status: 401 });
  }
  if (
    req.headers.get('x-crease-workspace') &&
    req.headers.get('x-crease-workspace') !== session.teamId
  )
    return NextResponse.json(
      {
        error:
          'The signed-in account changed. Sign in to the original account to sync these records.',
      },
      { status: 409 },
    );
  if (!(await getCurrentSessionAccount(session))) {
    return NextResponse.json(
      { error: 'Your session has expired. Sign in again.' },
      { status: 401 },
    );
  }
  if (session.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers cannot push changes.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!Array.isArray(body?.changes)) {
    return NextResponse.json({ error: 'changes must be an array.' }, { status: 400 });
  }
  if (body.changes.length > MAX_BATCH) {
    return NextResponse.json({ error: `Maximum ${MAX_BATCH} changes per push.` }, { status: 400 });
  }

  await connectDB();
  const applied = [];
  const rejected = [];

  for (const change of [...body.changes].sort((a, b) => syncPriority(a) - syncPriority(b))) {
    const { table, recordId, data, baseRevision, changeId, deleted } = change ?? {};
    if (
      !ALLOWED_TABLES.has(table) ||
      typeof recordId !== 'string' ||
      !UUID.test(recordId) ||
      typeof data !== 'object' ||
      data === null ||
      !Number.isInteger(baseRevision) ||
      baseRevision < 0 ||
      typeof changeId !== 'string' ||
      !UUID.test(changeId) ||
      typeof deleted !== 'boolean'
    ) {
      rejected.push({ table, recordId, reason: 'Invalid change format.', serverRecord: null });
      continue;
    }

    const filter = { teamId: session.teamId, table, recordId };
    const { workspaceId: _workspaceId, ...accountData } = data;
    try {
      const existing = await SyncRecord.findOne(filter);
      if (existing?.lastChangeId === changeId) {
        applied.push({ table, recordId, changeId, revision: existing.revision });
        continue;
      }
      if (!deleted && ['innings', 'events'].includes(table) && data.matchId) {
        const parent = await SyncRecord.findOne({
          teamId: session.teamId,
          table: 'matches',
          recordId: data.matchId,
        });
        if (
          (parent?.data?.startId && data.startId !== parent.data.startId) ||
          (data.startId && (!parent || parent.data?.startId !== data.startId))
        ) {
          rejected.push(
            conflict(
              change,
              existing,
              'This record belongs to a different match start. Resolve the match conflict first.',
            ),
          );
          continue;
        }
      }
      let consumedDraft = false;
      if (table === 'drafts' && deleted && data.consumedByMatchId) {
        const match = await SyncRecord.findOne({
          teamId: session.teamId,
          table: 'matches',
          recordId: data.consumedByMatchId,
          deletedAt: null,
        });
        consumedDraft = isConsumedDraft(change, match, existing);
      }
      const policyError = syncPolicyError(change, existing, session.role, { consumedDraft });
      if (policyError) {
        rejected.push(conflict(change, existing, policyError));
        continue;
      }
      if (!deleted && table === 'matches' && data.status === 'completed') {
        const [eventRecords, inningsRecords] = await Promise.all([
          SyncRecord.find({
            teamId: session.teamId,
            table: 'events',
            deletedAt: null,
            'data.matchId': recordId,
          }, { data: 1, _id: 0 }).lean(),
          SyncRecord.find({
            teamId: session.teamId,
            table: 'innings',
            deletedAt: null,
            'data.matchId': recordId,
          }, { data: 1, _id: 0 }).lean(),
        ]);
        const historyError = completedHistoryError(
          data,
          inningsRecords.map((record) => record.data),
          eventRecords.map((record) => record.data),
          data.syncSnapshot,
        );
        if (historyError) {
          rejected.push(
            conflict(
              change,
              existing,
              `${historyError} It will retry safely.`,
            ),
          );
          continue;
        }
      }
      if (deleted && ['players', 'teams'].includes(table)) {
        const reference = table === 'players' ? 'data.teams.squad.id' : 'data.teams.id';
        const history = await SyncRecord.exists({
          teamId: session.teamId,
          table: 'matches',
          [reference]: recordId,
        });
        if (history) {
          rejected.push(
            conflict(change, existing, 'Match history references this record. Archive it instead.'),
          );
          continue;
        }
      }
      if ((existing?.revision ?? 0) !== baseRevision) {
        rejected.push(
          conflict(change, existing, 'The server has a newer version. Resolve the conflict first.'),
        );
        continue;
      }

      const now = new Date();
      const update = {
        data: accountData,
        revision: baseRevision + 1,
        lastChangeId: changeId,
        deletedAt: deleted ? now : null,
        updatedAt: now,
      };
      if (existing) {
        const result = await SyncRecord.updateOne({ ...filter, revision: baseRevision }, update);
        if (result.modifiedCount !== 1) {
          const latest = await SyncRecord.findOne(filter);
          if (latest?.lastChangeId === changeId) {
            applied.push({ table, recordId, changeId, revision: latest.revision });
          } else {
            rejected.push(
              conflict(
                change,
                latest,
                'The server changed during this push. Resolve the conflict.',
              ),
            );
          }
          continue;
        }
      } else {
        await SyncRecord.create({ ...filter, ...update, createdAt: now });
      }
      applied.push({ table, recordId, changeId, revision: baseRevision + 1 });
    } catch (error) {
      if (error?.code === 11000) {
        const latest = await SyncRecord.findOne(filter);
        if (latest?.lastChangeId === changeId) {
          applied.push({ table, recordId, changeId, revision: latest.revision });
        } else {
          rejected.push(
            conflict(change, latest, 'Another device created this record. Resolve the conflict.'),
          );
        }
      } else {
        reportOperationalEvent('sync_push_record_error', {
          status: 'error',
          code: error?.code || error?.name || 'unknown',
        });
        rejected.push({
          table,
          recordId,
          reason: 'Server error applying change.',
          serverRecord: null,
        });
      }
    }
  }

  if (rejected.length)
    reportOperationalEvent('sync_push_rejected', {
      status: 'rejected',
      count: rejected.length,
      tables: [...new Set(rejected.map((item) => item.table).filter(Boolean))],
    });
  return NextResponse.json({ applied, rejected, pushedAt: new Date().toISOString() });
}
