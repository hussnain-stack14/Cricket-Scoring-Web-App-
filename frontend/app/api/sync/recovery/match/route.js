import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../../lib/server/db';
import { getSessionOptions } from '../../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../../backend/accountAuth';
import { SyncRecord } from '../../../../../backend/models';
import {
  planMatchRecovery,
  recoveredCompletedMatch,
  recoveryFingerprint,
} from '../../../../../backend/matchRecovery';
import { completedHistoryError } from '../../../../../backend/completedHistory';
import { reportOperationalEvent } from '../../../../../backend/monitoring';

const RECOVERY_ENABLED = process.env.MATCH_RECOVERY_ENABLED === 'true';

function headerMatchesSession(req, session) {
  const workspace = req.headers.get('x-crease-workspace');
  return !workspace || workspace === session.teamId;
}

function recoveryChangeId() {
  return randomUUID();
}

function accountData(data) {
  const { workspaceId: _workspaceId, ...scoped } = data;
  return scoped;
}

function publicAction(action) {
  return {
    table: action.table,
    recordId: action.recordId,
    action: action.action,
    baseRevision: action.baseRevision,
  };
}

/**
 * Owner-only, feature-gated repair for one verified deleted match history.
 * This is deliberately separate from normal sync: normal device changes can never resurrect a tombstone.
 */
export async function POST(req) {
  if (!RECOVERY_ENABLED)
    return NextResponse.json({ error: 'Match recovery is not enabled.' }, { status: 404 });

  const response = NextResponse.json(null);
  const session = await getIronSession(req, response, getSessionOptions());
  if (!session.teamId || !headerMatchesSession(req, session))
    return NextResponse.json(
      { error: 'Sign in to the original account to recover this match.' },
      { status: 401 },
    );
  if (session.role !== 'owner')
    return NextResponse.json(
      { error: 'Only the account owner can recover a deleted match.' },
      { status: 403 },
    );
  if (!(await getCurrentSessionAccount(session)))
    return NextResponse.json(
      { error: 'Your session has expired. Sign in again.' },
      { status: 401 },
    );

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid recovery request.' }, { status: 400 });
  }
  const history = body?.history;
  if (!history?.match?.id || !Array.isArray(history.innings) || !Array.isArray(history.events))
    return NextResponse.json({ error: 'A complete match history is required.' }, { status: 400 });
  const fingerprint = recoveryFingerprint(history);
  const expectedConfirmation = `RESTORE ${history.match.id} ${fingerprint}`;
  if (body.confirmation !== expectedConfirmation)
    return NextResponse.json(
      { error: 'Recovery confirmation does not match this exact verified history.' },
      { status: 400 },
    );

  await connectDB();
  const existing = await SyncRecord.find(
    {
      teamId: session.teamId,
      $or: [{ table: 'matches', recordId: history.match.id }, { 'data.matchId': history.match.id }],
    },
    { _id: 0, __v: 0 },
  ).lean();
  const plan = planMatchRecovery(history, existing);
  if (!plan.ready)
    return NextResponse.json(
      {
        error: 'Recovery preflight no longer matches Atlas. No data was changed.',
        validation: plan.validation.errors,
        conflicts: plan.conflicts,
      },
      { status: 409 },
    );

  const byAction = new Map(
    plan.actions.map((action) => [`${action.table}:${action.recordId}`, action]),
  );
  const finalMatch = recoveredCompletedMatch(history.match, history.events.length);
  const mongoSession = await SyncRecord.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      for (const table of ['innings', 'events']) {
        const records = table === 'innings' ? history.innings : history.events;
        for (const data of records) {
          const action = byAction.get(`${table}:${data.id}`);
          if (action.action === 'unchanged') continue;
          const now = new Date();
          const update = {
            data: accountData(data),
            deletedAt: null,
            updatedAt: now,
            lastChangeId: recoveryChangeId(),
          };
          if (action.action === 'create') {
            await SyncRecord.create(
              [
                {
                  teamId: session.teamId,
                  table,
                  recordId: data.id,
                  ...update,
                  revision: 1,
                  createdAt: now,
                },
              ],
              { session: mongoSession },
            );
          } else {
            const updated = await SyncRecord.updateOne(
              {
                teamId: session.teamId,
                table,
                recordId: data.id,
                revision: action.baseRevision,
                deletedAt: { $ne: null },
              },
              { $set: update, $inc: { revision: 1 } },
              { session: mongoSession },
            );
            if (updated.modifiedCount !== 1) throw new Error('RECOVERY_STALE');
          }
        }
      }

      const matchAction = byAction.get(`matches:${history.match.id}`);
      let matchRevision = matchAction.baseRevision;
      if (matchAction.action === 'create') {
        const now = new Date();
        await SyncRecord.create(
          [
            {
              teamId: session.teamId,
              table: 'matches',
              recordId: history.match.id,
              data: accountData({ ...finalMatch, status: 'live', completionPending: true }),
              deletedAt: null,
              revision: 1,
              lastChangeId: recoveryChangeId(),
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session: mongoSession },
        );
        matchRevision = 1;
      } else if (matchAction.action === 'restore') {
        const restored = await SyncRecord.updateOne(
          {
            teamId: session.teamId,
            table: 'matches',
            recordId: history.match.id,
            revision: matchAction.baseRevision,
            deletedAt: { $ne: null },
          },
          {
            $set: {
              data: accountData({ ...finalMatch, status: 'live', completionPending: true }),
              deletedAt: null,
              updatedAt: new Date(),
              lastChangeId: recoveryChangeId(),
            },
            $inc: { revision: 1 },
          },
          { session: mongoSession },
        );
        if (restored.modifiedCount !== 1) throw new Error('RECOVERY_STALE');
        matchRevision += 1;
      }

      const [eventRows, inningsRows] = await Promise.all([
        SyncRecord.find(
          {
            teamId: session.teamId,
            table: 'events',
            deletedAt: null,
            'data.matchId': history.match.id,
          },
          { data: 1, _id: 0 },
        )
          .session(mongoSession)
          .lean(),
        SyncRecord.find(
          {
            teamId: session.teamId,
            table: 'innings',
            deletedAt: null,
            'data.matchId': history.match.id,
          },
          { data: 1, _id: 0 },
        )
          .session(mongoSession)
          .lean(),
      ]);
      const historyError = completedHistoryError(
        finalMatch,
        inningsRows.map((row) => row.data),
        eventRows.map((row) => row.data),
        finalMatch.syncSnapshot,
      );
      if (historyError) throw new Error(`RECOVERY_HISTORY:${historyError}`);

      const completed = await SyncRecord.updateOne(
        {
          teamId: session.teamId,
          table: 'matches',
          recordId: history.match.id,
          revision: matchRevision,
          deletedAt: null,
        },
        {
          $set: { data: finalMatch, updatedAt: new Date(), lastChangeId: recoveryChangeId() },
          $inc: { revision: 1 },
        },
        { session: mongoSession },
      );
      if (completed.modifiedCount !== 1) throw new Error('RECOVERY_STALE');
    });
  } catch (error) {
    reportOperationalEvent('match_recovery_failed', {
      status: 'error',
      code: error?.message || 'unknown',
    });
    const message = error?.message?.startsWith('RECOVERY_HISTORY:')
      ? error.message.slice('RECOVERY_HISTORY:'.length)
      : 'Atlas changed or the history could not be verified. No records were changed.';
    return NextResponse.json({ error: message }, { status: 409 });
  } finally {
    await mongoSession.endSession();
  }

  reportOperationalEvent('match_recovery_completed', {
    status: 'ok',
    restored: plan.actions.filter((action) => action.action === 'restore').length,
    created: plan.actions.filter((action) => action.action === 'create').length,
  });
  return NextResponse.json({
    recovered: true,
    matchId: history.match.id,
    fingerprint: plan.fingerprint,
    actions: plan.actions.map(publicAction),
  });
}
