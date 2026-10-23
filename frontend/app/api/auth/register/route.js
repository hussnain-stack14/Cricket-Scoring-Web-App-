import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getIronSession } from 'iron-session';
import {
  connectDB,
  getSafeErrorDetails,
  isDatabaseConnectionError,
} from '../../../../lib/server/db';
import { TeamAccount, TeamMember } from '../../../../lib/server/models';
import { getSessionOptions } from '../../../../lib/server/session';
import { registerLimiter, checkRateLimit, getClientIp } from '../../../../lib/server/rateLimit';
import { isValidLoginTeamId, normalizeLoginTeamId } from '../../../../lib/accountCredentials';

/**
 * Generate a stable internal partition key for team-owned records.
 */
async function generateTeamId(session) {
  const teamId = crypto.randomUUID();
  const exists = await TeamAccount.exists({ teamId }).session(session);
  if (!exists) return teamId;
  throw new Error('Could not generate an internal account ID. Please try again.');
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

  const { teamName, teamId, password, confirmPassword } = body ?? {};

  const loginTeamId = typeof teamId === 'string' ? normalizeLoginTeamId(teamId) : '';
  if (!isValidLoginTeamId(loginTeamId)) {
    return NextResponse.json(
      {
        error:
          'Team ID must be 4–24 characters using letters, numbers, underscores, or hyphens. Some IDs are reserved.',
      },
      { status: 400 },
    );
  }

  // Validate team name
  if (typeof teamName !== 'string' || teamName.trim().length < 2 || teamName.trim().length > 100) {
    return NextResponse.json(
      { error: 'Team name must be between 2 and 100 characters.' },
      { status: 400 },
    );
  }

  // Validate password strength
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
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

  try {
    const authOptions = getSessionOptions();
    await connectDB();

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);
    const dbSession = await mongoose.startSession();
    let account;
    let memberId;
    try {
      await dbSession.withTransaction(async () => {
        const teamId = await generateTeamId(dbSession);
        const existingLoginId = await TeamAccount.exists({
          $or: [{ loginTeamId }, { loginTeamId: { $exists: false }, teamId: loginTeamId }],
        }).session(dbSession);
        if (existingLoginId) {
          const error = new Error('That Team ID is already in use.');
          error.code = 11000;
          throw error;
        }
        memberId = crypto.randomUUID();
        [account] = await TeamAccount.create(
          [
            {
              teamId,
              loginTeamId,
              name: teamName.trim(),
              passwordHash,
              authVersion: 0,
            },
          ],
          { session: dbSession },
        );
        await TeamMember.create(
          [
            {
              teamId,
              memberId,
              displayName: teamName.trim() + ' (Owner)',
              role: 'owner',
              activatedAt: new Date(),
            },
          ],
          { session: dbSession },
        );
      });
    } finally {
      await dbSession.endSession();
    }

    // Start authenticated session
    const res = NextResponse.json(
      {
        teamId: account.loginTeamId,
        teamName: account.name,
        memberId,
        role: 'owner',
      },
      { status: 201 },
    );

    const session = await getIronSession(req, res, authOptions);
    session.teamId = account.teamId;
    session.accountId = account._id.toString();
    session.publicTeamId = account.loginTeamId;
    session.teamName = account.name;
    session.memberId = memberId;
    session.role = 'owner';
    session.authVersion = account.authVersion ?? 0;
    session.sessionId = crypto.randomUUID();
    await session.save();

    return res;
  } catch (error) {
    console.error('Registration error:', getSafeErrorDetails(error));
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'That Team ID is already in use. Choose another identifier.' },
        { status: 409 },
      );
    }
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: 'Database service is currently unavailable. Please verify connection settings.' },
        { status: 503 },
      );
    }
    if (error.message?.includes('SESSION_SECRET')) {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'Registration is temporarily unavailable. Please try again.' },
      { status: 500 },
    );
  }
}
