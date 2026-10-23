import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { TeamAccount, TeamMember } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';

/**
 * POST /api/team/join
 * Body: { teamId, memberId, inviteToken, displayName, password, confirmPassword }
 *
 * Validates the invite link and activates the member with their own credential.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { teamId, memberId, inviteToken, displayName, password, confirmPassword } = body ?? {};

  if (
    typeof teamId !== 'string' ||
    typeof memberId !== 'string' ||
    typeof inviteToken !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'Choose a password of at least 6 characters.' },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
  }

  await connectDB();

  const member = await TeamMember.findOne({
    teamId: teamId.toUpperCase().trim(),
    memberId,
    activatedAt: null,
    inviteExpiry: { $gt: new Date() },
  });

  if (!member?.inviteTokenHash) {
    return NextResponse.json(
      { error: 'This invite link has expired or has already been used.' },
      { status: 400 },
    );
  }

  const tokenMatch = await bcrypt.compare(inviteToken, member.inviteTokenHash);
  if (!tokenMatch) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 400 });
  }

  const credentialHash = await bcrypt.hash(password, 12);
  const finalDisplayName =
    typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim().slice(0, 100)
      : member.displayName;

  await TeamMember.updateOne(
    { teamId: member.teamId, memberId },
    {
      displayName: finalDisplayName,
      credentialHash,
      inviteTokenHash: null,
      inviteExpiry: null,
      activatedAt: new Date(),
      lastActiveAt: new Date(),
    },
  );

  // Fetch team name for session
  const account = await TeamAccount.findOne(
    { teamId: member.teamId },
    { name: 1, loginTeamId: 1, authVersion: 1 },
  );
  const publicTeamId = account?.loginTeamId || member.teamId;

  const res = NextResponse.json({
    teamId: publicTeamId,
    teamName: account?.name ?? '',
    memberId,
    role: member.role,
  });

  const session = await getIronSession(req, res, getSessionOptions());
  session.teamId = member.teamId;
  session.accountId = account?._id.toString();
  session.publicTeamId = publicTeamId;
  session.teamName = account?.name ?? '';
  session.memberId = memberId;
  session.role = member.role;
  session.authVersion = account?.authVersion ?? 0;
  session.sessionId = randomUUID();
  await session.save();

  return res;
}
