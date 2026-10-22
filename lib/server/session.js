import { getIronSession } from 'iron-session';

const SESSION_SECRET = process.env.SESSION_SECRET;

export const sessionOptions = {
  password:
    SESSION_SECRET && SESSION_SECRET.length >= 32
      ? SESSION_SECRET
      : 'crease-default-secret-key-minimum-32-chars-long-for-iron-session',
  cookieName: 'crease-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: '/',
  },
};

/**
 * Get the iron-session from a Next.js route handler's request/response pair.
 * @param {Request} req  Next.js App Router Request
 * @param {Response} res Next.js App Router Response
 */
export async function getSession(req, res) {
  return getIronSession(req, res, sessionOptions);
}

/**
 * Session payload shape:
 * {
 *   teamId: string,       // "CRS-XXXXXX" — the stable public team identifier
 *   teamName: string,     // display name
 *   memberId: string,     // UUID of the authenticated member record (owner or invite member)
 *   role: 'owner' | 'scorer' | 'viewer',
 * }
 */
