import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '../../../../lib/server/session';
import { SessionRevocation, TeamAccount } from '../../../../lib/server/models';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';

/** POST /api/auth/logout — invalidates the current session and clears its browser cookie */
export async function POST(req) {
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession(req, res, getSessionOptions());
  if (
    req.headers.get('x-crease-workspace') &&
    req.headers.get('x-crease-workspace') !== session.teamId
  )
    return NextResponse.json(
      { error: 'The signed-in account changed. Cancel and sign in to the original account.' },
      { status: 409 },
    );
  try {
    const account = await getCurrentSessionAccount(session);
    if (session.sessionId) {
      await SessionRevocation.updateOne(
        { sessionId: session.sessionId },
        {
          $setOnInsert: {
            sessionId: session.sessionId,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true },
      );
    } else if (account) {
      const invalidated = await TeamAccount.updateOne(
        { _id: account._id, authVersion: account.authVersion ?? 0 },
        { $inc: { authVersion: 1 } },
      );
      if (invalidated.modifiedCount !== 1) {
        return NextResponse.json(
          { error: 'The session changed while signing out. Please retry.' },
          { status: 409 },
        );
      }
    }
    await session.destroy();
  } catch (error) {
    console.error('Sign out session invalidation failed:', error?.name || 'Error');
    return NextResponse.json(
      { error: 'Could not invalidate the session. Your local data has not been removed.' },
      { status: 503 },
    );
  }
  return res;
}
