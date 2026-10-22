'use client';
import { Shield } from 'lucide-react';
import SignOutAction from './SignOutAction';
import SyncStatus from './SyncStatus';

export default function TeamAccountMenu({
  session,
  workspaceId,
  syncStatus,
  pending,
  syncing,
  onSync,
  collapsed = false,
}) {
  if (!session) {
    return (
      <a href="/account/login/" className="sidebar-link" title={collapsed ? 'Sign in' : undefined}>
        <Shield size={20} strokeWidth={1.9} />
        <span>Sign in / Sync</span>
      </a>
    );
  }

  return (
    <div className="team-account-menu">
      <div className="team-account-identity">
        <strong title={session.teamName}>{session.teamName}</strong>
        <small>{session.teamId}</small>
      </div>
      <SyncStatus status={syncStatus} pending={pending} onSync={onSync} syncing={syncing} compact />
      <a
        href="/account/settings/"
        className="sidebar-link"
        title={collapsed ? 'Account settings' : undefined}
      >
        <Shield size={18} />
        <span>Account settings</span>
      </a>
      {session.role === 'owner' && (
        <a
          href="/account/settings/#security"
          className="sidebar-link"
          title={collapsed ? 'Account security' : undefined}
        >
          <Shield size={18} />
          <span>Security</span>
        </a>
      )}
      <SignOutAction workspaceId={workspaceId} compact />
    </div>
  );
}
