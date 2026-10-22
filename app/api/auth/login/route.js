import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { TeamAccount, TeamMember } from '../../../../lib/server/models';
import { sessionOptions } from '../../../../lib/server/session';
import { loginLimiter, checkRateLimit, getClientIp } from '../../../../lib/server/rateLimit';

/** POST /api/auth/login */
export async function POST(req) {
  const ip = getClientIp(req);
  const limited = await checkRateLimit(loginLimiter, ip);
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { teamId, password } = body ?? {};

  // Basic format validation — do not reveal whether the team exists
  if (
    typeof teamId !== 'string' ||
    !/^CRS-\d{6}$/.test(teamId.toUpperCase().trim())
  ) {
    return NextResponse.json(
      { error: 'Team ID or password is incorrect.' },
      { status: 401 },
    );
  }
  if (typeof password !== 'string' || password.length < 1) {
    return NextResponse.json(
      { error: 'Team ID or password is incorrect.' },
      { status: 401 },
    );
  }

  await connectDB();

  const account = await TeamAccount.findOne({ teamId: teamId.toUpperCase().trim() });

  // Constant-time comparison to resist timing attacks
  const dummyHash = '$2b$12$invalidhashpaddingtoresisttimingattacks.invalidsalt.xxx';
  const hash = account?.passwordHash ?? dummyHash;
  const match = await bcrypt.compare(password, hash);

  if (!account || !match) {
    return NextResponse.json(
      { error: 'Team ID or password is incorrect.' },
      { status: 401 },
    );
  }

  // Find or create the owner member record
  let ownerMember = await TeamMember.findOne({ teamId: account.teamId, role: 'owner' });
  if (!ownerMember) {
    // Legacy: create owner member if missing (migration path)
    const { randomUUID } = await import('node:crypto');
    ownerMember = await TeamMember.create({
      teamId: account.teamId,
      memberId: randomUUID(),
      displayName: account.name + ' (Owner)',
      role: 'owner',
      activatedAt: new Date(),
    });
  }

  // Update last login timestamp
  await TeamAccount.updateOne({ teamId: account.teamId }, { lastLoginAt: new Date() });

  const res = NextResponse.json({
    teamId: account.teamId,
    teamName: account.name,
    memberId: ownerMember.memberId,
    role: 'owner',
  });

  const session = await getIronSession(req, res, sessionOptions);
  session.teamId = account.teamId;
  session.teamName = account.name;
  session.memberId = ownerMember.memberId;
  session.role = 'owner';
  await session.save();

  return res;
}
