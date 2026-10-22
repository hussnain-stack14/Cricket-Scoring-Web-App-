import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { connectDB } from '../../../../../lib/server/db';
import { TeamAccount } from '../../../../../lib/server/models';
import { registerLimiter, checkRateLimit, getClientIp } from '../../../../../lib/server/rateLimit';

function getResend() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

/**
 * POST /api/auth/recovery/request
 * Body: { teamId, recoveryEmail }
 *
 * Sends a password-reset link to the registered recovery email.
 * Always returns 200 to avoid account enumeration.
 */
export async function POST(req) {
  const ip = getClientIp(req);
  const limited = await checkRateLimit(registerLimiter, ip); // reuse 5/hr limit
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // Never reveal errors
  }

  const { teamId, recoveryEmail } = body ?? {};

  if (
    typeof teamId !== 'string' ||
    typeof recoveryEmail !== 'string'
  ) {
    return NextResponse.json({ ok: true });
  }

  await connectDB();

  const account = await TeamAccount.findOne({ teamId: teamId.toUpperCase().trim() });

  // Only send email if team exists AND has a matching recovery email
  if (account?.recoveryEmail) {
    const emailMatch = await bcrypt.compare(
      recoveryEmail.toLowerCase().trim(),
      account.recoveryEmailHash,
    );

    if (emailMatch) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await TeamAccount.updateOne(
        { teamId: account.teamId },
        { recoveryTokenHash: tokenHash, recoveryTokenExpiry: expiry },
      );

      const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/account/reset-password/?token=${token}&teamId=${account.teamId}`;

      const resend = getResend();
      if (resend) {
        await resend.emails.send({
          from: 'Crease <noreply@crease.app>',
          to: account.recoveryEmail,
          subject: 'Reset your Crease password',
          html: `
            <p>Hi,</p>
            <p>Someone requested a password reset for the Crease team account <strong>${account.teamId}</strong> (${account.name}).</p>
            <p>Click the link below to reset your password. The link expires in 1 hour.</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>If you did not request this, ignore this email. Your password has not changed.</p>
            <p>— The Crease team</p>
          `,
        });
      }
    }
  }

  // Always return OK — do not reveal whether the team/email exists
  return NextResponse.json({ ok: true });
}
