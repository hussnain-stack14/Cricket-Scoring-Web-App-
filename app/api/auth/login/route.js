import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import {
  connectDB,
  getSafeErrorDetails,
  isDatabaseConnectionError,
} from '../../../../lib/server/db';
import { TeamAccount, TeamMember } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';
import { loginLimiter, checkRateLimit, getClientIp } from '../../../../lib/server/rateLimit';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../../../../lib/accountCredentials';

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
  if (typeof teamId !== 'string' || !isValidLoginTeamId(normalizeLoginTeamId(teamId))) {
    return NextResponse.json({ error: 'Team ID or password is incorrect.' }, { status: 401 });
  }
  if (typeof password !== 'string' || password.length < 1) {
    return NextResponse.json({ error: 'Team ID or password is incorrect.' }, { status: 401 });
  }

  try {
    const authOptions = getSessionOptions();
    await connectDB();

    const normalizedTeamId = normalizeLoginTeamId(teamId);
    const account = await TeamAccount.findOne({
      $or: [
        { loginTeamId: normalizedTeamId },
        { loginTeamId: { $exists: false }, teamId: normalizedTeamId },
      ],
    });

    // Constant-time comparison to resist timing attacks
    const dummyHash = '$2b$12$invalidhashpaddingtoresisttimingattacks.invalidsalt.xxx';
    const hash = account?.passwordHash ?? dummyHash;
    const match = await bcrypt.compare(password, hash);

    if (!account || !match) {
      return NextResponse.json({ error: 'Team ID or password is incorrect.' }, { status: 401 });
    }

    if (!account.loginTeamId) {
      account.loginTeamId = account.teamId;
      await account.save();
    }

    // Find or create the owner member record
    let ownerMember = await TeamMember.findOne({ teamId: account.teamId, role: 'owner' });
    if (!ownerMember) {
      // Legacy: create owner member if missing (migration path)
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
      teamId: account.loginTeamId,
      teamName: account.name,
      memberId: ownerMember.memberId,
      role: 'owner',
    });

    const session = await getIronSession(req, res, authOptions);
    session.teamId = account.teamId;
    session.accountId = account._id.toString();
    session.publicTeamId = account.loginTeamId;
    session.teamName = account.name;
    session.memberId = ownerMember.memberId;
    session.role = 'owner';
    session.authVersion = account.authVersion ?? 0;
    session.sessionId = randomUUID();
    await session.save();

    return res;
  } catch (err) {
    console.error('Login error:', getSafeErrorDetails(err));
    if (isDatabaseConnectionError(err)) {
      return NextResponse.json(
        { error: 'Database service is currently unavailable. Please verify connection settings.' },
        { status: 503 },
      );
    }
    if (err.message?.includes('SESSION_SECRET')) {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'Sign in is temporarily unavailable. Please try again.' },
      { status: 500 },
    );
  }
}
