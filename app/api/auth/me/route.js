import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '../../../../lib/server/session';

/** GET /api/auth/me — returns current session (no password, no DB _id) */
export async function GET(req) {
  const res = NextResponse.json(null); // placeholder, overwritten below
  const session = await getIronSession(req, res, getSessionOptions());

  if (!session.teamId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Renew the session cookie (sliding expiry)
  await session.save();

  return NextResponse.json({
    authenticated: true,
    teamId: session.teamId,
    teamName: session.teamName,
    memberId: session.memberId,
    role: session.role,
  });
}
