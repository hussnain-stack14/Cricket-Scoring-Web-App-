import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncRecord } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';

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

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(0);

  if (isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: 'Invalid since parameter.' }, { status: 400 });
  }

  await connectDB();

  const records = await SyncRecord.find(
    {
      teamId: session.teamId, // ALWAYS filter by session — never by query param
      updatedAt: { $gt: sinceDate },
    },
    { __v: 0, _id: 0 }, // never expose MongoDB _id
  ).lean();

  return NextResponse.json({
    records,
    pulledAt: new Date().toISOString(),
  });
}
