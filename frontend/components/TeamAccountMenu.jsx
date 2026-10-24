'use client';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import SignOutAction from './SignOutAction';

export default function TeamAccountMenu({ session, workspaceId }) {
  if (!session) {
    return (
      <Link href="/account/login/" className="sidebar-link">
        <Shield size={20} strokeWidth={1.9} />
        <span>Sign in / Sync</span>
      </Link>
    );
  }

  return (
    <div className="team-account-menu">
      <div className="team-account-identity">
        <strong title={session.teamName}>{session.teamName}</strong>
        <small>{session.teamId}</small>
      </div>
      <Link href="/account/settings/" className="sidebar-link">
        <Shield size={18} />
        <span>Account settings</span>
      </Link>
      {session.role === 'owner' && (
        <Link href="/account/settings/#security" className="sidebar-link">
          <Shield size={18} />
          <span>Security</span>
        </Link>
      )}
      <SignOutAction workspaceId={workspaceId} compact />
    </div>
  );
}
