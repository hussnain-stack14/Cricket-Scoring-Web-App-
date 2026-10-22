import { getIronSession } from 'iron-session';

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  // In production this will throw at import time. In dev, we still throw to catch misconfig early.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET must be at least 32 characters. Set it as a Vercel environment variable.',
    );
  }
}

export const sessionOptions = {
  password: SESSION_SECRET || 'dev-only-secret-must-be-at-least-32-chars-long',
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
