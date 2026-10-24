import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncRecord } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';

const ALLOWED_TABLES = [
  'players',
  'teams',
  'memberships',
  'matches',
  'innings',
  'events',
  'audits',
  'drafts',
];

/**
 * GET /api/sync/pull?since=<ISO8601>
 *
 * Returns all SyncRecords (including soft-deleted) updated since the given timestamp.
 * Authorization: session teamId — never trusts a teamId from query params.
 */
export async function GET(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, getSessionOptions());

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

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');
  const cursor = since ? new Date(since) : new Date(0);

  if (isNaN(cursor.getTime())) {
    return NextResponse.json({ error: 'Invalid since parameter.' }, { status: 400 });
  }

  await connectDB();

  const pulledAt = new Date();
  const sinceDate = new Date(Math.max(0, cursor.getTime() - 1000));
  const records = await SyncRecord.find(
    {
      teamId: session.teamId, // ALWAYS filter by session — never by query param
      updatedAt: { $gte: sinceDate, $lte: pulledAt },
    },
    { __v: 0, _id: 0 }, // never expose MongoDB _id
  )
    .sort({ updatedAt: 1, table: 1, recordId: 1 })
    .lean();

  return NextResponse.json({
    records,
    pulledAt: pulledAt.toISOString(),
  });
}
