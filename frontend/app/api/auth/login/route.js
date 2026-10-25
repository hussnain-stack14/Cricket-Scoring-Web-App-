import { loginAttempt, lockedResponse } from '../../../../backend/loginAttempts.js';
import { authenticationServiceFailure } from '../../../../backend/authErrors.js';
import { verifyLoginCredentials } from '../../../../backend/loginCredentials.js';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { connectDB, getSafeErrorDetails } from '../../../../lib/server/db';
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
    const before = await loginAttempt(normalizedTeamId);
    if (before.blocked) return lockedResponse(before.retryAfter);
    const account = await TeamAccount.findOne({
      $or: [
        { loginTeamId: normalizedTeamId },
        { loginTeamId: { $exists: false }, teamId: normalizedTeamId },
      ],
    });

    const match = await verifyLoginCredentials(account, password, bcrypt.compare);

    const attempt = await loginAttempt(normalizedTeamId, !!account && match);
    if (attempt.blocked) return lockedResponse(attempt.retryAfter);
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
    const failure = authenticationServiceFailure(err);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
