'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Leaf,
  UserPlus,
  Trash2,
  Copy,
  Check,
  Shield,
  Link,
} from 'lucide-react';
import { activateAccountWorkspace, db, exportBackup, listWorkspaces } from '../lib/db';
import { fetchSession, getSyncState, resolveConflict, sync } from '../lib/sync';
import SignOutAction from './SignOutAction';
import SyncStatus from './SyncStatus';

const ROLE_LABELS = { owner: 'Owner', scorer: 'Scorer', viewer: 'Viewer' };
const ROLE_DESCRIPTIONS = {
  owner: 'Full team management, password settings, member management.',
  scorer: 'Create matches, record deliveries, manage scoring.',
  viewer: 'View matches and statistics only.',
};

export default function AccountSettings() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [syncMeta, setSyncMeta] = useState(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [conflicts, setConflicts] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [localWorkspaces, setLocalWorkspaces] = useState([]);
  const [migrateSourceId, setMigrateSourceId] = useState('');
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Invite form state
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState('scorer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Migrate state
  const [migrateStep, setMigrateStep] = useState(null); // null | 'preview' | 'done'
  const [migratePreview, setMigratePreview] = useState(null);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateError, setMigrateError] = useState('');

  const [actionError, setActionError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);

  const loadSession = useCallback(async () => {
    const s = await fetchSession();
    if (s) {
      const ws = await activateAccountWorkspace(s.teamId, s.teamName);
      setWorkspaceId(ws.id);
      const workspaces = await listWorkspaces();
      const metadata = await db.syncMeta.toArray();
      const linked = new Set(metadata.filter((item) => item.teamId).map((item) => item.workspaceId));
      const local = workspaces.filter((item) => item.id !== ws.id && !linked.has(item.id));
      setLocalWorkspaces(local);
      setMigrateSourceId((current) => current || local[0]?.id || '');
    }
    setSession(s);
    setSessionLoading(false);
  }, []);

  const loadSyncMeta = useCallback(async (id = workspaceId) => {
    if (id) {
      const state = await getSyncState(id);
      setSyncMeta(state.meta);
      setPendingSync(state.pending);
      setConflicts(state.conflicts);
    }
  }, [workspaceId]);

  const loadMembers = useCallback(async () => {
    if (!session) return;
    setMembersLoading(true);
    try {
      const res = await fetch('/api/team/members', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
    } finally {
      setMembersLoading(false);
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const s = await loadSession();
        if (s) {
          const meta = await db.syncMeta.where('teamId').equals(s.teamId).first();
          if (meta) {
            const state = await getSyncState(meta.workspaceId);
            if (active) {
              setSyncMeta(state.meta);
              setPendingSync(state.pending);
              setConflicts(state.conflicts);
            }
          }
        }
      } catch (error) {
        if (active) setActionError(error instanceof Error ? error.message : 'Could not load account data.');
        if (active) setSessionLoading(false);
      }
    }
    initialize();
    return () => {
      active = false;
    };
  }, [loadSession]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (session) loadMembers();
  }, [session, loadMembers]);

  async function handleSync() {
    setSyncing(true);
    setActionError('');
    try {
      if (workspaceId) {
        const result = await sync(workspaceId);
        if (result.status !== 'synced')
          setActionError(result.error || 'Sync did not finish. Your local changes are retained.');
        await loadSyncMeta(workspaceId);
      }
    } catch (e) {
      setActionError('Sync failed. Check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleResolveConflict(conflict, resolution) {
    if (!workspaceId) return;
    setSyncing(true);
    setActionError('');
    try {
      await resolveConflict(workspaceId, conflict, resolution);
      if (resolution === 'local') await sync(workspaceId);
      await loadSyncMeta(workspaceId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not resolve this sync conflict.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteError('');
    setInviteResult(null);
    try {
      const res = await fetch('/api/team/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: inviteDisplayName,
          role: inviteRole,
          email: inviteEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Could not create invite.');
        return;
      }
      setInviteResult(data);
      setInviteDisplayName('');
      setInviteEmail('');
      await loadMembers();
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRemoveMember(memberId) {
    if (!confirm('Remove this team member? They will lose access immediately.')) return;
    const res = await fetch('/api/team/members', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) await loadMembers();
    else {
      const data = await res.json();
      setActionError(data.error || 'Could not remove member.');
    }
  }

  async function previewMigrate() {
    const ws = localWorkspaces.find((item) => item.id === migrateSourceId);
    if (!ws) return;
    const backup = await exportBackup(ws);
    setMigratePreview({
      workspace: backup.workspace,
      players: backup.players.length,
      teams: backup.teams.length,
      matches: backup.matches.length,
      events: backup.events.length,
      audits: backup.audits.length,
      backup,
    });
    setMigrateStep('preview');
  }

  async function confirmMigrate() {
    if (!migratePreview) return;
    setMigrateBusy(true);
    setMigrateError('');

    // Auto-download backup before migration
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(migratePreview.backup, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `crease-pre-migration-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    try {
      const res = await fetch('/api/sync/migrate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: migratePreview.backup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMigrateError(data.error || 'Migration failed. Your local data was not changed.');
        return;
      }
      setMigrateStep('done');
      if (workspaceId) {
        await sync(workspaceId);
        await loadSyncMeta(workspaceId);
      }
    } catch {
      setMigrateError('Could not reach the server. Your local data is unchanged.');
    } finally {
      setMigrateBusy(false);
    }
  }

  function copyInviteLink(url) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    });
  }

  const statusKey =
    !online
      ? 'offline'
      : syncMeta?.syncStatus || (session ? 'pending' : 'unauthenticated');

  if (sessionLoading) {
    return (
      <div className="auth-shell">
        <main className="auth-main" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <p>Loading account…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a className="auth-brand" href="/">
          <span className="brand-mark"><Leaf size={20} /></span>
          crease<span>.</span>
        </a>
        <a href="/app/" className="auth-header-app-link">← App</a>
      </header>

      <main className="auth-main">
        <div className="auth-hero" style={{ marginBottom: '1.5rem' }}>
          <span className="auth-kicker"><Shield size={14} /> ACCOUNT SETTINGS</span>
          <h1>{session ? session.teamName : 'Team Account'}</h1>
          {session && (
            <p className="auth-team-id-display">
              Team ID: <strong>{session.teamId}</strong>
            </p>
          )}
        </div>

        {!session ? (
          <div className="auth-card">
            <p>You are not signed in to a team account.</p>
            <div className="auth-form-links" style={{ marginTop: '1rem' }}>
              <a href="/account/login/">Sign in</a>
              <a href="/account/register/">Create team account</a>
            </div>
          </div>
        ) : (
          <>
            {/* ─── Sync Status ─── */}
            <section className="account-section">
              <h2>Sync status</h2>
              <SyncStatus
                status={statusKey}
                pending={pendingSync}
                syncing={syncing}
                onSync={handleSync}
              />
              <div>
                {syncMeta?.lastPush && (
                  <small>Last sync: {new Date(syncMeta.lastPush).toLocaleString()}</small>
                )}
              </div>
              {syncMeta?.lastError && (
                <p className="auth-error" style={{ marginTop: '0.5rem' }}>{syncMeta.lastError}</p>
              )}
              {conflicts.length > 0 && (
                <div className="sync-conflicts">
                  <h3>Resolve changes from another device</h3>
                  <p>
                    Choose which version to keep for each conflicting record. Your local version
                    remains available until you choose.
                  </p>
                  {conflicts.map((conflict) => (
                    <div
                      className="sync-conflict-row"
                      key={`${conflict.table}:${conflict.recordId}`}
                    >
                      <span>
                        {conflict.table} · {conflict.recordId.slice(0, 8)}
                      </span>
                      <button
                        className="button compact secondary"
                        onClick={() => handleResolveConflict(conflict, 'local')}
                        disabled={syncing}
                      >
                        Keep local
                      </button>
                      <button
                        className="button compact secondary"
                        onClick={() => handleResolveConflict(conflict, 'remote')}
                        disabled={syncing}
                      >
                        Use server
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ─── Local Data Migration ─── */}
            {session.role === 'owner' && migrateStep === null && (
              <section className="account-section">
                <h2>Link local data to this account</h2>
                <p>
                  Upload your existing local teams, players and matches to this team account
                  so you can access them from other devices.
                </p>
                <p className="auth-field-hint">
                  A backup of your current local data will be downloaded automatically before upload.
                  Your local records will not be deleted.
                </p>
                {localWorkspaces.length > 0 ? (
                  <>
                    <label className="auth-field">
                      <span>Choose a local workspace</span>
                      <select
                        value={migrateSourceId}
                        onChange={(event) => setMigrateSourceId(event.target.value)}
                      >
                        {localWorkspaces.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button secondary" onClick={previewMigrate}>
                      <Link size={16} /> Preview and upload local data
                    </button>
                  </>
                ) : (
                  <p>No unlinked local workspaces are available to migrate.</p>
                )}
              </section>
            )}
            {migrateStep === 'preview' && migratePreview && (
              <section className="account-section">
                <h2>Preview: local data upload</h2>
                <div className="auth-info-card">
                  <p><strong>Workspace:</strong> {migratePreview.workspace.name}</p>
                  <p>
                    {migratePreview.players} players · {migratePreview.teams} teams ·{' '}
                    {migratePreview.matches} matches · {migratePreview.events} scoring events ·{' '}
                    {migratePreview.audits} audit records
                  </p>
                  <p>
                    A backup file will be downloaded to your device automatically before upload.
                    Any records already on the server will not be overwritten.
                  </p>
                </div>
                {migrateError && <p className="auth-error">{migrateError}</p>}
                <div className="actions">
                  <button className="button" onClick={confirmMigrate} disabled={migrateBusy}>
                    {migrateBusy ? 'Uploading…' : 'Confirm upload'}
                  </button>
                  <button className="button secondary" onClick={() => setMigrateStep(null)}>
                    Cancel
                  </button>
                </div>
              </section>
            )}
            {migrateStep === 'done' && (
              <section className="account-section">
                <h2>Upload complete</h2>
                <p>Your local data has been linked to this team account. It will now sync across your devices.</p>
                <button className="button secondary" onClick={() => setMigrateStep(null)}>
                  Done
                </button>
              </section>
            )}

            {/* ─── Team Members ─── */}
            {session.role === 'owner' && (
              <section className="account-section">
                <h2>Team members</h2>
                <p>
                  Invite scorers and viewers to access your team account with their own credentials.
                  They don't need the owner password.
                </p>

                {membersLoading ? (
                  <p>Loading members…</p>
                ) : (
                  <div className="members-list">
                    {members.map((m) => (
                      <div className="member-row" key={m.memberId}>
                        <div className="member-info">
                          <strong>{m.displayName}</strong>
                          <span className={`member-role-badge role-${m.role}`}>
                            {ROLE_LABELS[m.role]}
                          </span>
                          {!m.activatedAt && <span className="member-pending-badge">Invite pending</span>}
                        </div>
                        {m.role !== 'owner' && (
                          <button
                            className="icon-button danger"
                            onClick={() => handleRemoveMember(m.memberId)}
                            aria-label={`Remove ${m.displayName}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <form className="auth-form" onSubmit={handleInvite} style={{ marginTop: '1.5rem' }}>
                  <h3>Invite a new member</h3>
                  {inviteError && <p className="auth-error">{inviteError}</p>}
                  <div className="auth-field">
                    <label htmlFor="inviteDisplayName">Display name</label>
                    <input
                      id="inviteDisplayName"
                      type="text"
                      value={inviteDisplayName}
                      maxLength={100}
                      required
                      placeholder="e.g. Ali (Scorer)"
                      onChange={(e) => setInviteDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="inviteRole">Role</label>
                    <select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                    >
                      <option value="scorer">Scorer — can score matches</option>
                      <option value="viewer">Viewer — view only</option>
                    </select>
                    <p className="auth-field-hint">{ROLE_DESCRIPTIONS[inviteRole]}</p>
                  </div>
                  <div className="auth-field">
                    <label htmlFor="inviteEmail">Email (optional)</label>
                    <input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      placeholder="Send invite link by email"
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <button className="auth-submit" type="submit" disabled={inviteBusy}>
                    <UserPlus size={16} /> {inviteBusy ? 'Creating invite…' : 'Create invite link'}
                  </button>
                </form>

                {inviteResult && (
                  <div className="auth-info-card" style={{ marginTop: '1rem' }}>
                    <p><strong>Invite link created!</strong></p>
                    <p>Share this link with your team member. It expires in 7 days.</p>
                    <div className="auth-teamid-value" style={{ wordBreak: 'break-all' }}>
                      <code style={{ fontSize: '0.8rem' }}>{inviteResult.inviteUrl}</code>
                      <button
                        className="auth-copy-btn"
                        onClick={() => copyInviteLink(inviteResult.inviteUrl)}
                        type="button"
                      >
                        {copiedInvite ? <Check size={14} /> : <Copy size={14} />}
                        {copiedInvite ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ─── Sign out ─── */}
            <section className="account-section">
              <h2>Sign out</h2>
              <p>
                Signing out removes your session from this device. Your local scoring data is kept.
                You can sign in again at any time using your Team ID and password.
              </p>
              {actionError && <p className="auth-error">{actionError}</p>}
              <SignOutAction workspaceId={workspaceId} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
