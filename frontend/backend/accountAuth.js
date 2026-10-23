import 'server-only';
import { connectDB } from './db.js';
import { SessionRevocation, TeamAccount } from './models.js';
import { isSessionVersionCurrent } from '../lib/accountCredentials.js';

export async function getCurrentSessionAccount(session) {
  if (!session?.teamId) return null;
  await connectDB();

  const account = session.accountId
    ? await TeamAccount.findById(session.accountId)
    : await TeamAccount.findOne({ teamId: session.teamId });
  if (!account || account.teamId !== session.teamId) return null;

  if (!isSessionVersionCurrent(session.authVersion, account.authVersion)) {
    return null;
  }
  if (session.sessionId && (await SessionRevocation.exists({ sessionId: session.sessionId })))
    return null;

  return account;
}

export function hasSameOrigin(req) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');
  const protocol =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    new URL(req.url).protocol.slice(0, -1);
  const requestOrigin = host ? `${protocol}://${host}` : new URL(req.url).origin;
  try {
    return (
      (origin && new URL(origin).origin === requestOrigin) ||
      (referer && new URL(referer).origin === requestOrigin)
    );
  } catch {
    return false;
  }
}
