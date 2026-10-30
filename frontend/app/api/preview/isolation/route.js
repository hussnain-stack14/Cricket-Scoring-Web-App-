import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import {
  checkPreviewIsolation,
  previewIsolationPassed,
} from '../../../../backend/previewIsolation.js';
import { getSessionOptions } from '../../../../lib/server/session';
import { getCurrentSessionAccount } from '../../../../lib/server/accountAuth';
import { TeamAccount } from '../../../../lib/server/models';
import { resolveLoginAccount } from '../../../../backend/loginCredentials.js';
import { normalizeLoginIdentifier } from '../../../../lib/accountCredentials';

// This endpoint exists only to validate a Preview deployment before any test account is created.
// It returns booleans only and never exposes values, records, roles, or connection details.
export async function GET(req) {
  if (process.env.VERCEL_ENV !== 'preview') return new NextResponse(null, { status: 404 });
  try {
    if (new URL(req.url).searchParams.get('account-alias') === '1') {
      const session = await getIronSession(req, NextResponse.json(null), getSessionOptions());
      const account = await getCurrentSessionAccount(session);
      if (!account) return NextResponse.json({ authenticated: false }, { status: 401 });
      const workspaceKey = normalizeLoginIdentifier(account.teamId);
      const resolved = await resolveLoginAccount(TeamAccount, workspaceKey);
      return NextResponse.json({
        authenticated: true,
        workspaceKeyHasCanonicalUuidFormat: workspaceKey === account.teamId,
        publicLoginIdPresent:
          typeof account.loginTeamId === 'string' && account.loginTeamId.length > 0,
        immutableAliasResolvesToOwnAccount: resolved?.teamId === account.teamId,
      });
    }
    const diagnostic = await checkPreviewIsolation();
    return NextResponse.json(diagnostic, {
      status: previewIsolationPassed(diagnostic) ? 200 : 503,
    });
  } catch {
    return NextResponse.json(
      { error: 'Preview database isolation could not be verified.' },
      { status: 503 },
    );
  }
}
