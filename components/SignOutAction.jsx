'use client';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { activateGuestWorkspace } from '../lib/db';
import { getPendingCount, logoutTeamSession, sync } from '../lib/sync';

export default function SignOutAction({ workspaceId, compact = false }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function showConfirmation() {
    setError('');
    setPending(workspaceId ? await getPendingCount(workspaceId) : 0);
    setOpen(true);
  }

  async function finishSignOut() {
    setBusy(true);
    setError('');
    try {
      await logoutTeamSession();
      await activateGuestWorkspace();
      window.location.assign('/account/login/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function syncThenSignOut() {
    if (!workspaceId) return;
    setBusy(true);
    setError('');
    try {
      const result = await sync(workspaceId);
      const remaining = await getPendingCount(workspaceId);
      setPending(remaining);
      if (result.status === 'synced' && remaining === 0) {
        await finishSignOut();
      } else {
        setError(
          result.status === 'conflict'
            ? 'Resolve sync conflicts before syncing all changes. You can keep them locally and sign out.'
            : 'Some changes are still waiting to sync. Retry or keep them on this device.',
        );
      }
    } catch {
      setError('Sync failed. Your local changes are still safe.');
    } finally {
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
          <h2 id="signout-title">Sign out of this device?</h2>
          <p>
            Your local team records will be kept on this device. Signing out will not delete your
            cloud team data.
          </p>
          {pending > 0 && (
            <p role="status">
              {pending} change{pending === 1 ? ' is' : 's are'} waiting to sync.
            </p>
          )}
          {error && <p role="alert" className="auth-error">{error}</p>}
          <div className="signout-actions">
            {pending > 0 && (
              <button className="button" type="button" onClick={syncThenSignOut} disabled={busy}>
                {busy ? 'Working…' : 'Sync now'}
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
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
              {pending ? 'Sign out and keep local changes' : 'Sign out'}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
