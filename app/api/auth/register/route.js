import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { TeamAccount, TeamMember } from '../../../../lib/server/models';
import { sessionOptions } from '../../../../lib/server/session';
import { registerLimiter, checkRateLimit, getClientIp } from '../../../../lib/server/rateLimit';

/**
 * Generate a unique CRS-XXXXXX team ID.
 * Retries up to 5 times in the unlikely event of a collision.
 */
async function generateTeamId() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const digits = crypto.randomInt(100000, 999999);
    const teamId = `CRS-${digits}`;
    const exists = await TeamAccount.exists({ teamId });
    if (!exists) return teamId;
  }
  throw new Error('Could not generate a unique Team ID. Please try again.');
}

/** POST /api/auth/register */
export async function POST(req) {
  // Rate limit by IP
  const ip = getClientIp(req);
  const limited = await checkRateLimit(registerLimiter, ip);
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { teamName, password, confirmPassword } = body ?? {};

  // Validate team name
  if (
    typeof teamName !== 'string' ||
    teamName.trim().length < 2 ||
    teamName.trim().length > 100
  ) {
    return NextResponse.json(
      { error: 'Team name must be between 2 and 100 characters.' },
      { status: 400 },
    );
  }

  // Validate password strength
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
  }
  // Enforce reasonable complexity: at least one letter and one number
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json(
      { error: 'Password must contain at least one letter and one number.' },
      { status: 400 },
    );
  }

  await connectDB();

  // Hash the password
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate unique Team ID
  const teamId = await generateTeamId();

  // Stable owner memberId
  const memberId = crypto.randomUUID();

  // Create team account
  const account = await TeamAccount.create({
    teamId,
    name: teamName.trim(),
    passwordHash,
  });

  // Create the owner member entry
  await TeamMember.create({
    teamId,
    memberId,
    displayName: teamName.trim() + ' (Owner)',
    role: 'owner',
    activatedAt: new Date(),
  });

  // Start authenticated session
  const res = NextResponse.json(
    {
      teamId: account.teamId,
      teamName: account.name,
      memberId,
      role: 'owner',
    },
    { status: 201 },
  );

  const session = await getIronSession(req, res, sessionOptions);
  session.teamId = account.teamId;
  session.teamName = account.name;
  session.memberId = memberId;
  session.role = 'owner';
  await session.save();

  return res;
}
