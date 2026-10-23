'use client';
import { useEffect, useRef, useState } from 'react';
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
  'Some changes are not yet synchronized. Connect to the internet and sync before signing out.';

export default function SignOutAction({ workspaceId, compact = false }) {
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
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
        setError(UNSYNCED_MESSAGE);
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
      if (!sessionInvalidated) {
        await logoutTeamSession();
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
        <dialog className="signout-dialog" open aria-labelledby="signout-title">
          <h2 id="signout-title">{ready ? 'Sign out of Crease?' : 'Check team synchronization'}</h2>
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
                  {pending} change{pending === 1 ? ' is' : 's are'} waiting to sync.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
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
                  {busy ? 'Signing out…' : 'Sign Out & Remove Local Data'}
                </button>
              </>
            ) : (
              <>
                {blocked && (
                  <>
                    <button className="button" type="button" onClick={checkAndSync} disabled={busy}>
                      Retry Sync
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={downloadBackup}
                      disabled={busy}
                    >
                      Export Offline Backup
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
        </dialog>
      )}
    </>
  );
}
