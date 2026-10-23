import 'server-only';
import { getIronSession } from 'iron-session';

export function getSessionOptions() {
  const password = process.env.SESSION_SECRET;
  if (typeof password !== 'string' || password.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }

  return {
    password,
    cookieName: 'crease-session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    },
  };
}

/**
 * Get the iron-session from a Next.js route handler's request/response pair.
 * @param {Request} req  Next.js App Router Request
 * @param {Response} res Next.js App Router Response
 */
export async function getSession(req, res) {
  return getIronSession(req, res, getSessionOptions());
}

/**
 * Session payload shape:
 * {
 *   teamId: string,       // immutable internal account/workspace key
 *   publicTeamId: string, // changeable login identifier
 *   sessionId: string,   // individually revocable session token ID
 *   teamName: string,     // display name
 *   memberId: string,     // UUID of the authenticated member record (owner or invite member)
 *   role: 'owner' | 'scorer' | 'viewer',
 * }
 */
