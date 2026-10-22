import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { TeamAccount } from '../../../../lib/server/models';
import { getCurrentSessionAccount, hasSameOrigin } from '../../../../lib/server/accountAuth';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../../../../lib/accountCredentials';
import {
  accountSecurityAccountLimiter,
  accountSecurityIpLimiter,
  checkRateLimit,
  getClientIp,
} from '../../../../lib/server/rateLimit';
import { getSessionOptions } from '../../../../lib/server/session';

/** PATCH /api/account/team-id */
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
      { error: 'Only team owners can change the Team ID.' },
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
    typeof body.newTeamId !== 'string' ||
    typeof body.currentPassword !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Enter a new Team ID and your current password.' },
      { status: 400 },
    );
  }

  const newTeamId = normalizeLoginTeamId(body.newTeamId);
  if (!isValidLoginTeamId(newTeamId)) {
    return NextResponse.json(
      { error: 'Use CRS- followed by 4–12 letters or numbers. That ID is invalid or reserved.' },
      { status: 400 },
    );
  }
  if (!body.currentPassword) {
    return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
  }

  const currentLoginId = account.loginTeamId || account.teamId;
  if (newTeamId === currentLoginId) {
    return NextResponse.json({ error: 'Choose a different Team ID.' }, { status: 400 });
  }

  const matches = await bcrypt.compare(body.currentPassword, account.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  try {
    const existing = await TeamAccount.exists({
      _id: { $ne: account._id },
      $or: [{ loginTeamId: newTeamId }, { loginTeamId: { $exists: false }, teamId: newTeamId }],
    });
    if (existing) {
      return NextResponse.json({ error: 'That Team ID is already in use.' }, { status: 409 });
    }

    const currentLoginFilter = account.loginTeamId
      ? { loginTeamId: currentLoginId }
      : { loginTeamId: { $exists: false } };
    const updatedAccount = await TeamAccount.findOneAndUpdate(
      { _id: account._id, ...currentLoginFilter },
      { $set: { loginTeamId: newTeamId } },
      { new: true },
    );
    if (!updatedAccount) {
      return NextResponse.json(
        { error: 'The Team ID changed in another request. Refresh and try again.' },
        { status: 409 },
      );
    }

    const successResponse = NextResponse.json({ ok: true, teamId: newTeamId });
    const renewedSession = await getIronSession(req, successResponse, getSessionOptions());
    renewedSession.teamId = updatedAccount.teamId;
    renewedSession.accountId = updatedAccount._id.toString();
    renewedSession.publicTeamId = newTeamId;
    renewedSession.teamName = updatedAccount.name;
    renewedSession.authVersion = updatedAccount.authVersion ?? 0;
    renewedSession.memberId = session.memberId;
    renewedSession.role = session.role;
    await renewedSession.save();

    return successResponse;
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'That Team ID is already in use.' }, { status: 409 });
    }
    console.error('Team ID update failed:', error?.name || 'Error', error?.code || '');
    return NextResponse.json(
      { error: 'Could not update the Team ID. Please try again.' },
      { status: 500 },
    );
  }
}
