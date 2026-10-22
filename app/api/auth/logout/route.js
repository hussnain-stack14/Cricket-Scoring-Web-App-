import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '../../../../lib/server/session';

/** POST /api/auth/logout — clears the session cookie */
export async function POST(req) {
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession(req, res, getSessionOptions());
  session.destroy();
  return res;
}
