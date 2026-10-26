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
const PAGE_SIZE = 250;

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
  const untilParam = searchParams.get('until');
  const until = untilParam ? new Date(untilParam) : new Date();
  const afterUpdatedAtParam = searchParams.get('afterUpdatedAt');
  const afterUpdatedAt = afterUpdatedAtParam ? new Date(afterUpdatedAtParam) : null;
  const afterTable = searchParams.get('afterTable');
  const afterRecordId = searchParams.get('afterRecordId');

  if (
    isNaN(cursor.getTime()) ||
    isNaN(until.getTime()) ||
    (afterUpdatedAt &&
      (isNaN(afterUpdatedAt.getTime()) || !ALLOWED_TABLES.includes(afterTable) || !afterRecordId))
  ) {
    return NextResponse.json({ error: 'Invalid synchronization cursor.' }, { status: 400 });
  }

  await connectDB();

  const pulledAt = until;
  const sinceDate = new Date(Math.max(0, cursor.getTime() - 1000));
  const pageBoundary = afterUpdatedAt
    ? {
        $or: [
          { updatedAt: { $gt: afterUpdatedAt } },
          { updatedAt: afterUpdatedAt, table: { $gt: afterTable } },
          { updatedAt: afterUpdatedAt, table: afterTable, recordId: { $gt: afterRecordId } },
        ],
      }
    : {};
  const records = await SyncRecord.find(
    {
      teamId: session.teamId, // ALWAYS filter by session — never by query param
      updatedAt: { $gte: sinceDate, $lte: pulledAt },
      ...pageBoundary,
    },
    { __v: 0, _id: 0 }, // never expose MongoDB _id
  )
    .sort({ updatedAt: 1, table: 1, recordId: 1 })
    .limit(PAGE_SIZE + 1)
    .lean();

  const hasMore = records.length > PAGE_SIZE;
  const page = hasMore ? records.slice(0, PAGE_SIZE) : records;
  const last = page.at(-1);

  return NextResponse.json({
    records: page,
    pulledAt: pulledAt.toISOString(),
    until: pulledAt.toISOString(),
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            updatedAt: new Date(last.updatedAt).toISOString(),
            table: last.table,
            recordId: last.recordId,
          }
        : null,
  });
}
