import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '../../../../../lib/server/db';
import { TeamAccount } from '../../../../../lib/server/models';

/**
 * POST /api/auth/recovery/reset
 * Body: { teamId, token, newPassword, confirmPassword }
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { teamId, token, newPassword, confirmPassword } = body ?? {};

  if (
    typeof teamId !== 'string' ||
    typeof token !== 'string' ||
    typeof newPassword !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid reset request.' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 },
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
  }
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return NextResponse.json(
      { error: 'Password must contain at least one letter and one number.' },
      { status: 400 },
    );
  }

  await connectDB();

  const account = await TeamAccount.findOne({
    teamId: teamId.toUpperCase().trim(),
    recoveryTokenExpiry: { $gt: new Date() },
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
    { teamId: account.teamId },
    {
      passwordHash,
      recoveryTokenHash: null,
      recoveryTokenExpiry: null,
    },
  );

  return NextResponse.json({ ok: true });
}
