import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { Resend } from 'resend';
import { connectDB } from '../../../../lib/server/db';
import { TeamMember } from '../../../../lib/server/models';
import { sessionOptions } from '../../../../lib/server/session';

function getResend() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

/**
 * GET /api/team/members — list members (owner + scorer + viewer)
 * Requires: authenticated session with role=owner or scorer
 */
export async function GET(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);
  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to access team members.' }, { status: 401 });
  }

  await connectDB();
  const members = await TeamMember.find(
    { teamId: session.teamId },
    { inviteTokenHash: 0, credentialHash: 0, __v: 0 }, // never expose credential fields
  ).lean();

  return NextResponse.json({ members });
}

/**
 * POST /api/team/members — invite a new member
 * Body: { displayName, role, email? }
 * Requires: owner role
 */
export async function POST(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);

  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to manage team members.' }, { status: 401 });
  }
  if (session.role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can invite members.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { displayName, role, email } = body ?? {};

  if (
    typeof displayName !== 'string' ||
    displayName.trim().length < 1 ||
    displayName.trim().length > 100
  ) {
    return NextResponse.json(
      { error: 'Display name must be 1–100 characters.' },
      { status: 400 },
    );
  }

  if (!['scorer', 'viewer'].includes(role)) {
    return NextResponse.json(
      { error: 'Role must be "scorer" or "viewer".' },
      { status: 400 },
    );
  }

  await connectDB();

  const memberId = crypto.randomUUID();
  // Plain token to share (e.g., in URL or email). We only store the hash.
  const inviteToken = crypto.randomBytes(24).toString('hex');
  const inviteTokenHash = await bcrypt.hash(inviteToken, 10);
  const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await TeamMember.create({
    teamId: session.teamId,
    memberId,
    displayName: displayName.trim(),
    role,
    inviteTokenHash,
    inviteExpiry,
  });

  const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/account/join/?token=${inviteToken}&teamId=${session.teamId}&memberId=${memberId}`;

  // Send invite email if provided
  if (typeof email === 'string' && email.includes('@')) {
    const resend = getResend();
    if (resend) {
      await resend.emails.send({
        from: 'Crease <noreply@crease.app>',
        to: email,
        subject: `You've been invited to ${session.teamName} on Crease`,
        html: `
          <p>Hi ${displayName.trim()},</p>
          <p>You've been invited to join <strong>${session.teamName}</strong> on Crease as a <strong>${role}</strong>.</p>
          <p>Click the link below to accept the invitation and set up your access. The link expires in 7 days.</p>
          <p><a href="${inviteUrl}">${inviteUrl}</a></p>
          <p>— The Crease team</p>
        `,
      }).catch(console.error); // Don't fail if email send fails
    }
  }

  return NextResponse.json(
    {
      memberId,
      inviteUrl,
      inviteToken, // Returned so owner can copy/share manually
      expiresAt: inviteExpiry,
    },
    { status: 201 },
  );
}

/**
 * DELETE /api/team/members — remove a member
 * Body: { memberId }
 * Requires: owner role
 */
export async function DELETE(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);

  if (!session.teamId || session.role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can remove members.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { memberId } = body ?? {};

  if (typeof memberId !== 'string') {
    return NextResponse.json({ error: 'memberId required.' }, { status: 400 });
  }

  await connectDB();

  // Cannot delete owner
  const member = await TeamMember.findOne({ teamId: session.teamId, memberId });
  if (!member) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }
  if (member.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the team owner.' }, { status: 400 });
  }

  await TeamMember.deleteOne({ teamId: session.teamId, memberId });
  return NextResponse.json({ ok: true });
}
