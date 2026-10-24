'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sheet } from './ui';
import { inspectSync } from '../lib/syncDiagnostics';
import { LogOut } from 'lucide-react';
import { clearAccountWorkspace, db, exportBackup } from '../lib/db';
import {
  beginSignOut,
  cancelSignOut,
  getPendingCount,
  getSyncState,
  logoutTeamSession,
  renewSignOut,
  sync,
} from '../lib/sync';

const UNSYNCED_MESSAGE =
  'Your changes are saved on this device. The cloud could not be reached. Please retry when the connection is available.';

export default function SignOutAction({ workspaceId, compact = false }) {
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reauthenticate, setReauthenticate] = useState(false);
  const [error, setError] = useState('');
  const [signOutToken, setSignOutToken] = useState(null);
  const [sessionInvalidated, setSessionInvalidated] = useState(false);

  useEffect(() => {
    if (!open || !signOutToken) return undefined;
    const interval = window.setInterval(() => {
      void renewSignOut(workspaceId, signOutToken);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [open, signOutToken, workspaceId]);

  async function releaseLock() {
    if (!signOutToken) return;
    await cancelSignOut(workspaceId, signOutToken);
    setSignOutToken(null);
  }

  async function checkAndSync() {
    if (!workspaceId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setReady(false);
    setBlocked(false);
    setError('');
    setReauthenticate(false);
    let token;
    try {
      const initialState = await getSyncState(workspaceId);
      setPending(initialState.pending);
      if (!navigator.onLine) {
        setBlocked(true);
        setError(UNSYNCED_MESSAGE);
        return;
      }

      token = await beginSignOut(workspaceId);
      setSignOutToken(token);
      const result = await sync(workspaceId, { signOutToken: token });
      const finalState = await getSyncState(workspaceId);
      setPending(finalState.pending);
      if (
        result.status !== 'synced' ||
        finalState.pending !== 0 ||
        finalState.conflicts.length !== 0
      ) {
        await cancelSignOut(workspaceId, token);
        setSignOutToken(null);
        setBlocked(true);
        setReauthenticate(result.status === 'unauthenticated');
        setError(
          result.error ||
            (finalState.conflicts.length
              ? 'Some records differ from the cloud. Review conflicts in account settings before signing out.'
              : UNSYNCED_MESSAGE),
        );
        return;
      }
      setReady(true);
    } catch (syncError) {
      let lockError;
      if (token) {
        try {
          await cancelSignOut(workspaceId, token);
        } catch (releaseError) {
          lockError = releaseError;
          console.error('Could not release the sign-out write lock:', releaseError);
        }
      }
      setSignOutToken(null);
      setBlocked(true);
      setError(
        lockError instanceof Error
          ? `${syncError instanceof Error ? syncError.message : UNSYNCED_MESSAGE} ${lockError.message}`
          : syncError instanceof Error
            ? syncError.message
            : UNSYNCED_MESSAGE,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function showConfirmation() {
    setOpen(true);
    await checkAndSync();
  }

  async function closeConfirmation() {
    if (busyRef.current) return;
    try {
      await releaseLock();
      setOpen(false);
      setReady(false);
      setBlocked(false);
      setError('');
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'Could not cancel sign out.');
    }
  }

  async function downloadBackup() {
    try {
      const teamWorkspace = await db.workspaces.get(workspaceId);
      if (!teamWorkspace) throw new Error('The local team workspace is not available.');
      const backup = await exportBackup(teamWorkspace);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `crease-offline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : 'Could not export a backup.');
    }
  }

  async function finishSignOut() {
    if (!ready || !signOutToken || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!(await renewSignOut(workspaceId, signOutToken)))
        throw new Error('Sign out expired. Retry synchronization before continuing.');
      const state = await getSyncState(workspaceId);
      if (state.pending || state.conflicts.length)
        throw new Error('New changes are waiting. Sync again before signing out.');
      if (!sessionInvalidated) {
        await logoutTeamSession(workspaceId);
        setSessionInvalidated(true);
      }
      await clearAccountWorkspace(workspaceId, signOutToken);
      setSignOutToken(null);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('crease-account-session');
        channel.postMessage({ type: 'signed-out', workspaceId });
        channel.close();
      }
      try {
        localStorage.setItem(
          'crease-account-signed-out',
          JSON.stringify({ workspaceId, nonce: crypto.randomUUID() }),
        );
        localStorage.removeItem('crease-account-signed-out');
      } catch (notificationError) {
        console.error('Could not notify other Crease tabs after sign out:', notificationError);
      }
      window.location.assign('/account/login/');
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'Sign out failed. Your local team data has not been reported as removed.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={`sidebar-link signout-link ${compact ? 'compact' : ''}`}
        type="button"
        onClick={showConfirmation}
        title="Sign out"
      >
        <LogOut size={18} />
        <span>Sign out</span>
      </button>
      {open && (
        <Sheet
          title={ready ? 'Sign out of Crease?' : 'Unsynced changes'}
          close={() => {
            if (!busy && !sessionInvalidated) void closeConfirmation();
          }}
        >
          {ready ? (
            <>
              <p>
                Your team data is safely synchronized. Signing out will remove this team&apos;s
                downloaded data from this device. Your cloud records will remain available when you
                sign in again.
              </p>
              <p role="status">All changes synced</p>
            </>
          ) : (
            <>
              <p>{busy ? 'Syncing changes before sign out…' : UNSYNCED_MESSAGE}</p>
              {pending > 0 && (
                <p role="status">
                  You have {pending} change{pending === 1 ? '' : 's'} saved on this device that
                  haven't reached the cloud.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          {reauthenticate && <Link href="/account/login/">Sign in to the same account</Link>}
          {blocked && (
            <button
              className="text-button"
              type="button"
              onClick={async () => {
                const report = await inspectSync(workspaceId);
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'crease-sync-diagnostics.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export sync diagnostics
            </button>
          )}
          <div className="signout-actions">
            {ready ? (
              <>
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeConfirmation}
                  disabled={busy || sessionInvalidated}
                >
                  Cancel
                </button>
                <button
                  className="button danger secondary"
                  type="button"
                  onClick={finishSignOut}
                  disabled={busy}
                >
                  <LogOut size={15} />
                  {busy ? 'Signing out…' : 'Confirm Sign Out'}
                </button>
              </>
            ) : (
              <>
                {blocked && (
                  <>
                    <button className="button" type="button" onClick={checkAndSync} disabled={busy}>
                      Sync & Sign Out
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={downloadBackup}
                      disabled={busy}
                    >
                      Export Backup
                    </button>
                  </>
                )}
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeConfirmation}
                  disabled={busy}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
