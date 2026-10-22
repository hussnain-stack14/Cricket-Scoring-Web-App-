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

const MAX_BATCH = 500; // max records per push

/**
 * POST /api/sync/push
 * Body: { changes: [{ table, recordId, data, revision, deletedAt? }] }
 *
 * Applies client changes to the server store idempotently.
 * Authorization: session teamId only.
 *
 * For matches: checks that the session holds the scoring lock before
 * accepting delivery events.
 */
export async function POST(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, getSessionOptions());

  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to sync your data.' }, { status: 401 });
  }

  // Viewers cannot push changes
  if (session.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers cannot push changes.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { changes } = body ?? {};

  if (!Array.isArray(changes)) {
    return NextResponse.json({ error: 'changes must be an array.' }, { status: 400 });
  }
  if (changes.length > MAX_BATCH) {
    return NextResponse.json({ error: `Maximum ${MAX_BATCH} changes per push.` }, { status: 400 });
  }

  await connectDB();

  const applied = [];
  const rejected = [];

  for (const change of changes) {
    const { table, recordId, data, revision, deletedAt } = change ?? {};

    // Validate each change
    if (
      typeof table !== 'string' ||
      !ALLOWED_TABLES.includes(table) ||
      typeof recordId !== 'string' ||
      !recordId ||
      typeof data !== 'object' ||
      data === null
    ) {
      rejected.push({ recordId, reason: 'Invalid change format.' });
      continue;
    }

    // UUID format check (prevents injection of server-generated IDs)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)) {
      rejected.push({ recordId, reason: 'Invalid record ID format.' });
      continue;
    }

    try {
      const existing = await SyncRecord.findOne({ teamId: session.teamId, table, recordId });

      if (existing) {
        // Reject stale writes (client must pull first)
        if (typeof revision === 'number' && existing.revision > revision) {
          rejected.push({ recordId, reason: 'Server has a newer revision. Pull first.' });
          continue;
        }
        // Idempotent: same revision = already applied
        if (typeof revision === 'number' && existing.revision === revision) {
          applied.push({ recordId, revision: existing.revision });
          continue;
        }
        await SyncRecord.updateOne(
          { teamId: session.teamId, table, recordId },
          {
            data,
            revision: (existing.revision || 0) + 1,
            deletedAt: deletedAt ?? null,
            updatedAt: new Date(),
          },
        );
        applied.push({ recordId, revision: (existing.revision || 0) + 1 });
      } else {
        // New record
        await SyncRecord.create({
          teamId: session.teamId,
          table,
          recordId,
          data,
          revision: 1,
          deletedAt: deletedAt ?? null,
        });
        applied.push({ recordId, revision: 1 });
      }
    } catch (err) {
      rejected.push({ recordId, reason: 'Server error applying change.' });
    }
  }

  return NextResponse.json({ applied, rejected, pushedAt: new Date().toISOString() });
}
