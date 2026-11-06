'use client';
import Link from 'next/link';
import { LockKeyhole, Settings, Shield, UserRound } from 'lucide-react';
import SignOutAction from './SignOutAction';
import SyncStatus from './SyncStatus';

export default function TeamAccountMenu({
  session,
  workspaceId,
  syncStatus,
  pendingSync,
  lastSuccessfulSync,
  syncError,
  syncing,
  onSync,
  online,
  offlineReady,
  onNavigate,
  onDismiss,
}) {
  if (!session) {
    return (
      <Link href="/account/login/" className="account-menu-item" onClick={onNavigate}>
        <Shield size={20} strokeWidth={1.9} />
        <span>Sign in / Sync</span>
      </Link>
    );
  }

  return (
    <div className="team-account-menu">
      <div className="team-account-identity" aria-label="Account details">
        <span className="team-account-avatar" aria-hidden="true">
          {(session.teamName || 'C').trim().slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong title={session.teamName}>{session.teamName}</strong>
          <small>{session.teamId}</small>
        </span>
      </div>
      <SyncStatus
        status={syncStatus}
        pending={pendingSync}
        lastSuccessfulSync={lastSuccessfulSync}
        error={syncError}
        onSync={onSync}
        syncing={syncing}
        compact
        online={online}
        offlineReady={offlineReady}
      />
      {syncError && <p className="account-menu-sync-error" role="alert">{syncError}</p>}
      <nav className="account-menu-actions" aria-label="Account actions">
        <Link
          href="/account/settings/#account-profile"
          className="account-menu-item"
          onClick={onNavigate}
        >
          <UserRound size={19} aria-hidden="true" />
          <span>Profile</span>
        </Link>
        <Link href="/app/more/" className="account-menu-item" onClick={onNavigate}>
          <Settings size={19} aria-hidden="true" />
          <span>Settings</span>
        </Link>
        <Link href="/account/settings/" className="account-menu-item" onClick={onNavigate}>
          <Shield size={18} />
          <span>Account settings</span>
        </Link>
        {session.role === 'owner' && (
          <Link
            href="/account/settings/#security"
            className="account-menu-item"
            onClick={onNavigate}
          >
            <LockKeyhole size={18} />
            <span>Security</span>
          </Link>
        )}
        <SignOutAction
          workspaceId={workspaceId}
          compact
          restoreFocus={onDismiss}
        />
      </nav>
    </div>
  );
}
