import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { getCurrentSessionAccount, hasSameOrigin } from '../../../../lib/server/accountAuth';
import { TeamAccount } from '../../../../lib/server/models';
import { passwordValidationError } from '../../../../lib/accountCredentials';
import {
  accountSecurityAccountLimiter,
  accountSecurityIpLimiter,
  checkRateLimit,
  getClientIp,
} from '../../../../lib/server/rateLimit';
import { getSessionOptions } from '../../../../lib/server/session';

/** PATCH /api/account/password */
export async function PATCH(req) {
  if (!hasSameOrigin(req)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const limited = await checkRateLimit(accountSecurityIpLimiter, getClientIp(req));
  if (limited) return limited;

  const session = await getIronSession(req, NextResponse.json(null), getSessionOptions());
  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to change account credentials.' }, { status: 401 });
  }
  if (session.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only team owners can change the password.' },
      { status: 403 },
    );
  }

  const account = await getCurrentSessionAccount(session);
  if (!account) {
    return NextResponse.json(
      { error: 'Your session has expired. Sign in again.' },
      { status: 401 },
    );
  }
  const accountLimit = await checkRateLimit(accountSecurityAccountLimiter, account._id.toString());
  if (accountLimit) return accountLimit;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.currentPassword !== 'string' ||
    typeof body.newPassword !== 'string' ||
    typeof body.confirmPassword !== 'string'
  ) {
    return NextResponse.json({ error: 'Complete all password fields.' }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body;
  if (!currentPassword) {
    return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
  }
  const passwordError = passwordValidationError(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: 'New passwords do not match.' }, { status: 400 });
  }

  const currentMatches = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!currentMatches) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }
  if (await bcrypt.compare(newPassword, account.passwordHash)) {
    return NextResponse.json(
      { error: 'Choose a password you have not used for this account.' },
      { status: 400 },
    );
  }

  const authVersion = account.authVersion ?? 0;
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await TeamAccount.updateOne(
    {
      _id: account._id,
      $or: [{ authVersion }, { authVersion: { $exists: false } }],
    },
    { $set: { passwordHash }, $inc: { authVersion: 1 } },
  );
  if (updated.modifiedCount !== 1) {
    return NextResponse.json(
      { error: 'Account security settings changed. Sign in again and retry.' },
      { status: 409 },
    );
  }

  const successResponse = NextResponse.json({ ok: true });
  try {
    const renewedSession = await getIronSession(req, successResponse, getSessionOptions());
    renewedSession.teamId = account.teamId;
    renewedSession.accountId = account._id.toString();
    renewedSession.publicTeamId = account.loginTeamId || account.teamId;
    renewedSession.teamName = account.name;
    renewedSession.memberId = session.memberId;
    renewedSession.role = session.role;
    renewedSession.authVersion = authVersion + 1;
    await renewedSession.save();
  } catch {
    return NextResponse.json(
      { error: 'Password changed. Please sign in again to continue.' },
      { status: 503 },
    );
  }

  return successResponse;
}
