'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  Database,
  Info,
  LockKeyhole,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  Palette,
  LoaderCircle,
} from 'lucide-react';
import {
  clearWorkspace,
  exportBackup,
  importBackup,
  saveWorkspace,
  validateBackup,
} from '../lib/db';
import { Button, Field, Sheet } from './ui';
import SignOutAction from './SignOutAction';
import SyncStatus from './SyncStatus';
import { setTheme, THEME_STORAGE_KEY } from './ThemeController';
export default function Settings({
  w,
  data,
  run,
  setError,
  offline,
  session,
  workspaceId,
  syncStatus,
  pendingSync,
  lastSuccessfulSync,
  syncError,
  syncing,
  onSync,
}) {
  const [name, setName] = useState(w.name),
    [rules, setRules] = useState(w.rules),
    [backup, setBackup] = useState(null),
    [confirm, setConfirm] = useState(false),
    [erase, setErase] = useState(''),
    [storage, setStorage] = useState(''),
    [localError, setLocalError] = useState(''),
    [selectedCategory, setSelectedCategory] = useState(null),
    [theme, setThemeChoice] = useState('classic'),
    [offlineActionMessage, setOfflineActionMessage] = useState('');
  const [preparingOffline, setPreparingOffline] = useState(false);
  const preparationInFlight = useRef(false);
  useEffect(
    () =>
      setThemeChoice(
        localStorage.getItem(THEME_STORAGE_KEY) === 'red-ball' ? 'red-ball' : 'classic',
      ),
    [],
  );
  function chooseTheme(next) {
    setThemeChoice(next);
    setTheme(next);
  }
  async function retryOfflinePreparation() {
    if (preparationInFlight.current) return;
    preparationInFlight.current = true;
    setPreparingOffline(true);
    setOfflineActionMessage('');
    try {
      const prepared = await offline.retry();
      setOfflineActionMessage(
        prepared
          ? 'Offline preparation complete.'
          : 'Preparation failed. Check your connection and retry.',
      );
    } finally {
      preparationInFlight.current = false;
      setPreparingOffline(false);
    }
  }
  async function installApp() {
    setOfflineActionMessage('Opening installation prompt…');
    const outcome = await offline.install();
    setOfflineActionMessage(
      {
        accepted: 'Installation started.',
        dismissed: 'Installation was canceled.',
        instructions: 'Use Installation help for browser instructions.',
        installed: 'Crease is already installed.',
        error: 'Could not open installation. Use Installation help.',
      }[outcome] || '',
    );
  }
  async function checkForUpdates() {
    setOfflineActionMessage('');
    await offline.checkForUpdate();
  }
  async function applyAvailableUpdate() {
    setOfflineActionMessage('');
    await offline.applyUpdate();
  }
  const categories = [
    {
      id: 'account',
      title: 'Team account',
      description: session ? 'Manage your team and sign-in' : 'Link records and manage sign-in',
      Icon: UserRound,
    },
    {
      id: 'security',
      title: 'Account security',
      description: 'Team ID, members, and access',
      Icon: LockKeyhole,
    },
    {
      id: 'sync',
      title: 'Cloud sync & offline',
      description: 'Connection, installation, and offline readiness',
      Icon: Cloud,
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Choose your Crease colour theme',
      Icon: Palette,
    },
    {
      id: 'storage',
      title: 'Storage & backup',
      description: 'Export, import, and protect your scorebook',
      Icon: Database,
    },
    {
      id: 'defaults',
      title: 'Match defaults',
      description: 'Set rules for new matches',
      Icon: SlidersHorizontal,
    },
    {
      id: 'about',
      title: 'About Crease',
      description: 'Features and supported match rules',
      Icon: Info,
    },
    {
      id: 'danger',
      title: 'Danger zone',
      description: 'Permanently delete local records',
      Icon: ShieldAlert,
    },
  ];
  async function download() {
    await run(async () => {
      const b = await exportBackup(w);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `crease-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await saveWorkspace({ ...w, lastExport: new Date().toISOString() });
    });
  }
  async function preview(file) {
    try {
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds the 20 MB limit.');
      const b = validateBackup(JSON.parse(await file.text()));
      setBackup(b);
      setLocalError('');
    } catch (error) {
      setError(
        error.message === 'Backup exceeds the 20 MB limit.'
          ? error.message
          : 'That backup file could not be read. Choose a valid Crease backup and try again.',
      );
    }
  }
  return (
    <>
      {!selectedCategory ? (
        <div className="settings-home">
          <section className="settings-shortcuts" aria-label="Scorebook">
            <Link className="settings-menu-row" href="/app/statistics/">
              <span className="settings-menu-icon">
                <SlidersHorizontal size={19} />
              </span>
              <span>
                <strong>Statistics</strong>
                <small>Explore team and player performance</small>
              </span>
              <ChevronRight size={18} />
            </Link>
            <Link className="settings-menu-row" href="/app/reports/">
              <span className="settings-menu-icon">
                <Info size={19} />
              </span>
              <span>
                <strong>Reports</strong>
                <small>Scorecards and match exports</small>
              </span>
              <ChevronRight size={18} />
            </Link>
          </section>
          <section className="settings-category-list" aria-label="Settings categories">
            {categories.map(({ id, title, description, Icon }) => (
              <button
                type="button"
                className="settings-menu-row"
                key={id}
                onClick={() => setSelectedCategory(id)}
              >
                <span className="settings-menu-icon">
                  <Icon size={19} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </section>
        </div>
      ) : (
        <>
          <button className="settings-back" type="button" onClick={() => setSelectedCategory(null)}>
            <ArrowLeft size={17} />
            All settings
          </button>
          <h2 className="settings-category-title">
            {categories.find((category) => category.id === selectedCategory)?.title}
          </h2>
        </>
      )}
      {selectedCategory === 'account' && (
        <>
          <section className="card">
            <h2>Team Account & Sync</h2>
            {session ? (
              <>
                <p>
                  {session.teamName} · Team ID <strong>{session.teamId}</strong>
                </p>
                <SyncStatus
                  status={syncStatus}
                  pending={pendingSync}
                  lastSuccessfulSync={lastSuccessfulSync}
                  error={syncError}
                  syncing={syncing}
                  onSync={onSync}
                />
                <div className="actions">
                  <Link className="button secondary" href="/account/settings/">
                    Account settings
                  </Link>
                  {session.role === 'owner' && (
                    <Link className="button secondary" href="/account/settings/#security">
                      Account security
                    </Link>
                  )}
                  <SignOutAction workspaceId={workspaceId} />
                </div>
              </>
            ) : (
              <>
                <p>
                  Sign in to synchronize matches, teams, and statistics across phones, tablets, and
                  desktops.
                </p>
                <div
                  style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}
                >
                  <Link className="button primary" href="/account/">
                    Manage Team Account & Sync
                  </Link>
                  <Link className="button secondary" href="/account/login/">
                    Sign in
                  </Link>
                  <Link className="button secondary" href="/account/register/">
                    Create Account
                  </Link>
                </div>
              </>
            )}
          </section>
          <section className="card">
            <h2>Your workspace</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveWorkspace({ ...w, name: name.trim() }));
              }}
            >
              <Field
                label="Local scorer name"
                value={name}
                required
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
              <Button>Save name</Button>
            </form>
            <p className="help">This is a local display name, not a secure login.</p>
          </section>
        </>
      )}
      {selectedCategory === 'security' && (
        <section className="card">
          <h2>Account security</h2>
          <p>Manage your team ID, members, and account access in the secure account area.</p>
          <Link
            className="button secondary"
            href={session ? '/account/settings/#security' : '/account/login/'}
          >
            {session ? 'Open account security' : 'Sign in to manage security'}
          </Link>
        </section>
      )}
      {selectedCategory === 'sync' && (
        <section className="card offline-settings-card">
          <h2>Offline & installation</h2>
          <p className="offline-readiness" role="status" aria-live="polite">
            {preparingOffline
              ? 'Preparing...'
              : offline.ready
                ? 'Ready to use offline'
                : offline.message}
          </p>
          <div className="offline-settings-actions">
            <button
              className="button secondary offline-action-button"
              type="button"
              disabled={preparingOffline}
              aria-busy={preparingOffline}
              onClick={() => void retryOfflinePreparation()}
            >
              {preparingOffline && (
                <LoaderCircle className="offline-action-spinner" size={16} aria-hidden="true" />
              )}
              {preparingOffline ? 'Preparing...' : 'Retry Preparation'}
            </button>
            <button
              className="button secondary offline-action-button"
              type="button"
              disabled={offline.updateCheckState === 'checking'}
              aria-busy={offline.updateCheckState === 'checking'}
              onClick={() => void checkForUpdates()}
            >
              {offline.updateCheckState === 'checking' && (
                <LoaderCircle className="offline-action-spinner" size={16} aria-hidden="true" />
              )}
              {offline.updateCheckState === 'checking' ? 'Checking...' : 'Check for Updates'}
            </button>
            <button
              className="button offline-action-button offline-install-button"
              type="button"
              disabled={offline.installed || offline.installState === 'prompting'}
              aria-busy={offline.installState === 'prompting'}
              onClick={() => void installApp()}
            >
              {offline.installState === 'prompting' && (
                <LoaderCircle className="offline-action-spinner" size={16} aria-hidden="true" />
              )}
              {offline.installed
                ? 'Installed'
                : offline.installState === 'prompting'
                  ? 'Opening...'
                  : 'Install Crease'}
            </button>
          </div>
          <div className="offline-action-feedback">
            {offline.updateCheckState === 'current' && <p role="status">You're up to date.</p>}
            {offline.updateCheckState === 'error' && (
              <>
                <p role="alert">{offline.updateCheckError}</p>
                <button
                  type="button"
                  className="offline-retry-link"
                  onClick={() => void checkForUpdates()}
                >
                  Retry check
                </button>
              </>
            )}
            {offlineActionMessage && <p role="status">{offlineActionMessage}</p>}
          </div>
          <details className="offline-install-help">
            <summary>Installation help</summary>
            <p>
              On iPhone or iPad, open Crease in Safari, tap Share, then Add to Home Screen. In
              Chromium browsers, choose Install app from the browser menu.
            </p>
          </details>
          {offline.update && (
            <div className="notice offline-update-panel">
              <p>A new version is ready.</p>
              <button
                className="button offline-action-button"
                type="button"
                disabled={offline.applyingUpdate}
                aria-busy={offline.applyingUpdate}
                onClick={() => void applyAvailableUpdate()}
              >
                {offline.applyingUpdate && (
                  <LoaderCircle className="offline-action-spinner" size={16} aria-hidden="true" />
                )}
                {offline.applyingUpdate
                  ? offline.updatePhase === 'applying'
                    ? 'Updating Crease...'
                    : 'Preparing update...'
                  : 'Update now'}
              </button>
              {(offline.updateBlocked ||
                offline.liveMatchCount > 0 ||
                data.matches.some((m) => m.status === 'live')) && (
                <p className="offline-update-status">
                  Finish live scoring before applying this update.
                </p>
              )}
              {offline.updateError && (
                <p role="alert" className="notice error">
                  {offline.updateError}
                </p>
              )}
            </div>
          )}
        </section>
      )}
      {selectedCategory === 'appearance' && (
        <section className="card">
          <h2>Appearance</h2>
          <p>
            Choose a professional colour system. Your preference stays on this device and works
            offline.
          </p>
          <div className="theme-options" role="group" aria-label="Colour theme">
            <button
              type="button"
              className="theme-option"
              aria-pressed={theme === 'classic'}
              onClick={() => chooseTheme('classic')}
            >
              <span className="theme-option-swatch">
                <i style={{ background: '#1f5a3d' }} />
                <i style={{ background: '#f7f8f3' }} />
              </span>
              <strong>Classic Green</strong>
              <br />
              <small>Crease&apos;s original field-ready look.</small>
            </button>
            <button
              type="button"
              className="theme-option"
              aria-pressed={theme === 'red-ball'}
              onClick={() => chooseTheme('red-ball')}
            >
              <span className="theme-option-swatch red">
                <i />
                <i />
              </span>
              <strong>Red Ball</strong>
              <br />
              <small>Premium red and white cricket styling.</small>
            </button>
            <button
              type="button"
              className="theme-option blue"
              aria-pressed={theme === 'blue'}
              onClick={() => chooseTheme('blue')}
            >
              <span className="theme-option-swatch">
                <i style={{ background: '#2563eb' }} />
                <i style={{ background: '#dbeafe' }} />
              </span>
              <strong>Premium Blue</strong>
              <br />
              <small>Clean blue and white sports styling.</small>
            </button>
          </div>
          <p className="help">
            App version: {process.env.NEXT_PUBLIC_APP_VERSION || 'Current deployment'}
          </p>
        </section>
      )}
      {selectedCategory === 'storage' && (
        <section className="card">
          <h2>Storage & backup</h2>
          <p>
            {session
              ? 'Records are saved on this device and available on another device after they have successfully synchronized to your account. Check sync status for pending cloud backup changes, and keep a separate export for additional protection.'
              : 'Records stay in this browser profile unless linked to a team account. Clearing browser data, storage eviction, or losing this device can remove them. Export regularly and keep the file somewhere safe.'}
          </p>
          <p className="help">
            Uninstalling Crease does not delete your cloud account records. Browser and operating
            system rules decide whether local storage remains after uninstall. After reinstalling,
            sign in to the same account and wait for cloud synchronization to restore backed-up
            records. Changes that never synchronized remain only on the original device.
          </p>
          <p className="help">
            Last export requested:{' '}
            {w.lastExport ? new Date(w.lastExport).toLocaleString() : 'Never'}. This is not ongoing
            backup protection; check that your downloaded file is saved.
          </p>
          <div className="actions">
            <Button onClick={download}>Export JSON backup</Button>
            <label className="button secondary">
              Import backup
              <input
                className="file-input"
                type="file"
                accept="application/json,.json"
                aria-label="Import backup"
                onChange={(e) => {
                  preview(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <Button
            secondary
            onClick={async () => {
              const persisted = await navigator.storage?.persist?.();
              const estimate = await navigator.storage?.estimate?.();
              setStorage(
                `${persisted ? 'Persistent storage granted.' : 'Persistent storage unavailable or not granted.'} Using approximately ${Math.round((estimate?.usage || 0) / 1024)} KB.`,
              );
            }}
          >
            Request persistent storage
          </Button>
          <p role="status" className="help">
            {storage}
          </p>
        </section>
      )}
      {selectedCategory === 'defaults' && (
        <section className="card">
          <h2>Default match rules</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!Number.isSafeInteger(rules.size) || rules.size < 2) {
                setError('Players per team must be a whole number of at least 2.');
                return;
              }
              if (rules.maxBowler > rules.overs || rules.maxBowler * rules.size < rules.overs) {
                setError('Bowler limit must cover the innings and not exceed match overs.');
                return;
              }
              run(() => saveWorkspace({ ...w, rules }));
            }}
          >
            {[
              ['overs', 'Overs per innings', 1, 50],
              ['size', 'Players per team', 2, undefined],
              ['maxBowler', 'Maximum overs per bowler', 1, 50],
            ].map(([key, label, min, max]) => (
              <Field
                key={key}
                label={label}
                required
                type="number"
                min={min}
                max={max}
                value={rules[key]}
                onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
              />
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={rules.freeHit}
                onChange={(e) => setRules({ ...rules, freeHit: e.target.checked })}
              />
              Free hit after every no-ball
            </label>
            <Button>Save default rules</Button>
          </form>
        </section>
      )}
      {selectedCategory === 'about' && (
        <section className="card">
          <h2>About Crease</h2>
          <p>
            Your game, recorded. Six-ball limited-overs cricket with local teams, match history and
            statistics. A team account can synchronize records across devices when connected.
          </p>
          <p className="help">
            Supports bowled, caught, LBW, stumped, hit wicket and run out. No retired batters, DLS,
            penalty-run incidents, super overs or mid-over bowler substitutions. Full rule contract
            is in the project documentation.
          </p>
        </section>
      )}
      {selectedCategory === 'danger' && (
        <section className="card settings-danger-zone">
          <h2>Delete local records</h2>
          <p>
            This permanently removes the current workspace and its local records. This cannot be
            undone. Export a backup before continuing.
          </p>
          <Button danger secondary onClick={() => setConfirm(true)}>
            Review deletion
          </Button>
        </section>
      )}
      {backup && (
        <Sheet title="Preview backup replacement" close={() => setBackup(null)}>
          <p>
            From {backup.workspace.name} · {backup.exportedAt}
          </p>
          <p>
            {backup.players.length} players · {backup.teams.length} teams · {backup.matches.length}{' '}
            matches · {backup.events.length} events · {backup.audits.length} audit records.
          </p>
          <p>
            This replaces all records in this workspace in one transaction. Export your current
            records first. Imported records stay marked as pending until cloud acknowledgments
            arrive. Other tabs should be closed.
          </p>
          {session && !backup.accountTeamId && (
            <p className="help">
              This legacy backup has no account identity. It will be imported only into the
              currently signed-in workspace and then verified by cloud sync.
            </p>
          )}
          {session &&
            backup.accountTeamId &&
            backup.accountTeamId !== (session.workspaceKey || session.teamId) && (
              <p role="alert">
                This backup belongs to a different team account and cannot be imported here.
              </p>
            )}
          <Button secondary onClick={download}>
            Export current records first
          </Button>
          {localError && <p role="alert">{localError}</p>}
          <Button
            danger
            onClick={async () => {
              if (
                await run(() => importBackup(w.id, backup), {
                  awaitSync: !!session,
                })
              )
                setBackup(null);
              else
                setLocalError(
                  'Import failed. Existing records were preserved. Close this sheet to see the error.',
                );
            }}
          >
            Confirm replacement
          </Button>
        </Sheet>
      )}
      {confirm && (
        <Sheet title="Delete all local records?" close={() => setConfirm(false)}>
          <p>
            This permanently removes this workspace, teams, players, matches and history. Export a
            backup before continuing.
          </p>
          <Button secondary onClick={download}>
            Export backup first
          </Button>
          <Field
            label="Type DELETE to confirm"
            value={erase}
            onChange={(e) => setErase(e.target.value)}
          />
          <Button
            danger
            disabled={erase !== 'DELETE'}
            onClick={() => run(() => clearWorkspace(w.id))}
          >
            Permanently delete records
          </Button>
        </Sheet>
      )}
    </>
  );
}
