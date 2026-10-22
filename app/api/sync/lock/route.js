import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncLock } from '../../../../lib/server/models';
import { sessionOptions } from '../../../../lib/server/session';

const LOCK_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const HEARTBEAT_GRACE_MS = 90 * 1000; // allow 90s grace for heartbeat delay

/**
 * POST /api/sync/lock
 * Body: { matchId, action: 'acquire' | 'release' | 'heartbeat' | 'takeover', deviceName? }
 *
 * Acquire: grants the lock if no active lock exists, or if the existing lock belongs to this session.
 * Release: releases the lock if held by this session.
 * Heartbeat: extends the lock expiry (called every 30s while actively scoring).
 * Takeover: force-acquires the lock (owner only).
 *
 * GET /api/sync/lock?matchId=...  — returns current lock status
 */
export async function GET(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);

  if (!session.teamId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get('matchId');
  if (!matchId) {
    return NextResponse.json({ error: 'matchId required.' }, { status: 400 });
  }

  await connectDB();

  const lock = await SyncLock.findOne({ teamId: session.teamId, matchId }).lean();

  if (!lock || new Date(lock.expiresAt) < new Date()) {
    return NextResponse.json({ locked: false, lockedBy: null });
  }

  const isHolder = lock.lockedBy === session.memberId;
  return NextResponse.json({
    locked: true,
    lockedBy: lock.lockedBy,
    lockedByName: lock.lockedByName,
    isHolder,
    expiresAt: lock.expiresAt,
  });
}

export async function POST(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);

  if (!session.teamId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (session.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers cannot acquire scoring lock.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { matchId, action, deviceName } = body ?? {};

  if (typeof matchId !== 'string' || !matchId) {
    return NextResponse.json({ error: 'matchId required.' }, { status: 400 });
  }

  await connectDB();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

  if (action === 'acquire' || action === 'heartbeat') {
    const existing = await SyncLock.findOne({ teamId: session.teamId, matchId });

    if (existing && existing.lockedBy !== session.memberId) {
      // Check if lock has actually expired (TTL index may not have fired yet)
      if (new Date(existing.expiresAt) > now) {
        return NextResponse.json(
          {
            granted: false,
            lockedBy: existing.lockedBy,
            lockedByName: existing.lockedByName,
            expiresAt: existing.expiresAt,
          },
          { status: 409 },
        );
      }
      // Expired: replace
      await SyncLock.deleteOne({ teamId: session.teamId, matchId });
    }

    await SyncLock.findOneAndUpdate(
      { teamId: session.teamId, matchId },
      {
        lockedBy: session.memberId,
        lockedByName: deviceName || session.teamName,
        lockedAt: existing?.lockedBy === session.memberId ? existing.lockedAt : now,
        expiresAt,
        lastHeartbeat: now,
      },
      { upsert: true, new: true },
    );

    return NextResponse.json({ granted: true, expiresAt });
  }

  if (action === 'release') {
    await SyncLock.deleteOne({ teamId: session.teamId, matchId, lockedBy: session.memberId });
    return NextResponse.json({ released: true });
  }

  if (action === 'takeover') {
    // Only owners can force-takeover
    if (session.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only team owners can take over scoring.' },
        { status: 403 },
      );
    }
    await SyncLock.findOneAndUpdate(
      { teamId: session.teamId, matchId },
      {
        lockedBy: session.memberId,
        lockedByName: (deviceName || session.teamName) + ' (takeover)',
        lockedAt: now,
        expiresAt,
        lastHeartbeat: now,
      },
      { upsert: true, new: true },
    );
    return NextResponse.json({ granted: true, takeover: true, expiresAt });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
