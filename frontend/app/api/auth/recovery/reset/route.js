import {
  resetIpLimiter,
  resetAccountLimiter,
  checkRateLimit,
  getClientIp,
} from '../../../../../lib/server/rateLimit';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '../../../../../lib/server/db';
import { TeamAccount } from '../../../../../lib/server/models';
import {
  normalizeLoginTeamId,
  passwordValidationError,
} from '../../../../../lib/accountCredentials';

/**
 * POST /api/auth/recovery/reset
 * Body: { teamId, token, newPassword, confirmPassword }
 */
export async function POST(req) {
  const limited = await checkRateLimit(resetIpLimiter, getClientIp(req));
  if (limited) return limited;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { teamId, token, newPassword, confirmPassword } = body ?? {};

  if (typeof teamId !== 'string' || typeof token !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Invalid reset request.' }, { status: 400 });
  }

  const passwordError = passwordValidationError(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
  }
  await connectDB();

  const normalizedTeamId = normalizeLoginTeamId(teamId);
  const accountLimit = await checkRateLimit(resetAccountLimiter, normalizedTeamId);
  if (accountLimit) return accountLimit;
  const account = await TeamAccount.findOne({
    recoveryTokenExpiry: { $gt: new Date() },
    $or: [
      { loginTeamId: normalizedTeamId },
      { loginTeamId: { $exists: false }, teamId: normalizedTeamId },
    ],
  });

  if (!account?.recoveryTokenHash) {
    return NextResponse.json(
      { error: 'This reset link has expired or is invalid. Request a new one.' },
      { status: 400 },
    );
  }

  const tokenMatch = await bcrypt.compare(token, account.recoveryTokenHash);
  if (!tokenMatch) {
    return NextResponse.json(
      { error: 'This reset link has expired or is invalid. Request a new one.' },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await TeamAccount.updateOne(
    {
      _id: account._id,
      $or: [{ authVersion: account.authVersion ?? 0 }, { authVersion: { $exists: false } }],
    },
    {
      $set: {
        passwordHash,
        recoveryTokenHash: null,
        recoveryTokenExpiry: null,
        loginTeamId: account.loginTeamId || account.teamId,
      },
      $inc: { authVersion: 1 },
    },
  );

  return NextResponse.json({ ok: true });
}
