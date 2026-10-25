import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';
import { authenticationServiceFailure } from '../../../../backend/authErrors.js';
import { getSafeErrorDetails } from '../../../../lib/server/db';

/** GET /api/auth/me — returns current session (no password, no DB _id) */
export async function GET(req) {
  try {
    const options = getSessionOptions();
    const session = await getIronSession(req, NextResponse.json(null), options);

    const account = await getCurrentSessionAccount(session);
    if (!account) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const loginTeamId = account.loginTeamId || account.teamId;
    if (!account.loginTeamId) {
      account.loginTeamId = loginTeamId;
      await account.save();
    }

    const response = NextResponse.json({
      authenticated: true,
      teamId: loginTeamId,
      workspaceKey: account.teamId,
      teamName: account.name,
      memberId: session.memberId,
      role: session.role,
    });
    const renewedSession = await getIronSession(req, response, options);
    renewedSession.teamId = account.teamId;
    renewedSession.accountId = account._id.toString();
    renewedSession.publicTeamId = loginTeamId;
    renewedSession.authVersion = account.authVersion ?? 0;
    renewedSession.teamName = account.name;
    renewedSession.sessionId = session.sessionId || randomUUID();
    await renewedSession.save();

    return response;
  } catch (error) {
    console.error('Session validation failed:', getSafeErrorDetails(error));
    const failure = authenticationServiceFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
