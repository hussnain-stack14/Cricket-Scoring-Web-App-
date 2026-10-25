import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncRecord } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';
import { matchStates, overs } from '../../../../lib/engine';

function summarizeScore(match, innings, events) {
  try {
    return matchStates(match, innings, events).map((state, index) => ({
      innings: index + 1,
      runs: state.runs,
      wickets: state.wickets,
      overs: overs(state.balls),
      completed: Boolean(state.done),
    }));
  } catch (error) {
    return { replayError: error instanceof Error ? error.message.slice(0, 180) : 'History could not be replayed.' };
  }
}

// Account-scoped and read-only. Delivery payloads and Mongo internals are never returned.
export async function GET(req) {
  const response = NextResponse.json(null);
  const session = await getIronSession(req, response, getSessionOptions());
  if (!session.teamId || !(await getCurrentSessionAccount(session)))
    return NextResponse.json({ error: 'Sign in to inspect this account.' }, { status: 401 });
  const workspace = req.headers.get('x-crease-workspace');
  if (workspace && workspace !== session.teamId)
    return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 409 });

  const matchId = new URL(req.url).searchParams.get('matchId');
  if (!matchId || matchId.length > 200)
    return NextResponse.json({ error: 'A match ID is required.' }, { status: 400 });

  await connectDB();
  const records = await SyncRecord.find(
    { teamId: session.teamId, $or: [{ table: 'matches', recordId: matchId }, { 'data.matchId': matchId }] },
    { _id: 0, __v: 0, teamId: 0, lastChangeId: 0, 'data.deliveries': 0 },
  ).lean();
  const matchRecord = records.find((record) => record.table === 'matches' && record.recordId === matchId);
  if (!matchRecord || matchRecord.deletedAt)
    return NextResponse.json({ error: 'This match is not stored in this account.' }, { status: 404 });

  const active = records.filter((record) => !record.deletedAt);
  const innings = active.filter((record) => record.table === 'innings').map((record) => record.data);
  const events = active.filter((record) => record.table === 'events').map((record) => record.data);
  const match = matchRecord.data;
  return NextResponse.json({
    accountKey: session.teamId,
    match: {
      matchId,
      status: match.status,
      revision: matchRecord.revision,
      updatedAt: matchRecord.updatedAt,
      completedAt: match.completedAt || null,
      syncSnapshot: match.syncSnapshot || null,
      inningsRecords: innings.length,
      eventRecords: events.length,
      scores: summarizeScore(match, innings, events),
    },
    childRevisions: active
      .filter((record) => record.table === 'innings' || record.table === 'events')
      .map((record) => ({ table: record.table, recordId: record.recordId, revision: record.revision, updatedAt: record.updatedAt })),
  });
}
