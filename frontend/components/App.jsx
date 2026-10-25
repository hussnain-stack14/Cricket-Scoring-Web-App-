'use client';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users,
  UserRound,
  Ellipsis,
  Home,
  Plus,
  ArrowUpRight,
  Leaf,
  LayoutDashboard,
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Clock3,
  CheckCircle2,
  ArrowRight,
  Cloud,
} from 'lucide-react';
import {
  deleteMatch,
  deleteRecord,
  activateAccountWorkspace,
  all,
  createWorkspace,
  findGuestWorkspace,
  getActiveCachedAccountSession,
  invalidateCachedAccountSession,
  workspace,
} from '../lib/db';
import { matchStates, result } from '../lib/engine';
import { teamStatistics } from '../lib/statistics';
import { fetchSession, getSyncState, sync } from '../lib/sync';
import { Button, Field, Empty, Sheet } from './ui';
import dynamic from 'next/dynamic';
import ScreenSkeleton from './Skeletons';
import { upcomingMatches, matchLabel, scheduledAction } from '../lib/matchLifecycle';
import People from './People';
const Statistics = dynamic(() => import('./Statistics'), {
  loading: () => <ScreenSkeleton screen="statistics" />,
});
import Setup from './Setup';
const Match = dynamic(() => import('./Match'), {
  loading: () => <ScreenSkeleton screen="match" />,
});
const Profile = dynamic(() => import('./Profile'), {
  loading: () => <ScreenSkeleton screen="player" />,
});
const Settings = dynamic(() => import('./Settings'), {
  loading: () => <ScreenSkeleton screen="account" />,
});
import { useOffline } from './offline';
import { DownloadScorecardButton } from './ReportActions';
import SyncStatus, { SYNC_STATUS_LABELS } from './SyncStatus';
import TeamAccountMenu from './TeamAccountMenu';
function userError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/another tab|revision/i.test(message))
    return 'This match was updated in another tab. Refresh to see the latest score.';
  if (/indexeddb|dexie|transaction|quota|database|storage/i.test(message))
    return 'Could not save your changes. Check available storage and try again.';
  if (/service.?worker|precache|cache registration/i.test(message))
    return "Offline setup couldn't finish. Connect to the internet and try again.";
  if (/delivery validation|invalid delivery/i.test(message))
    return 'Please check this ball and try again.';
  if (/match missing|record missing|workspace missing/i.test(message))
    return 'This record is no longer available. Refresh and try again.';
  return message && message.length < 180 ? message : 'Something went wrong. Please try again.';
}
export default function App({ screen }) {
  const [w, setW] = useState(null),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [loaded, setLoaded] = useState(false),
    [name, setName] = useState(''),
    [filter, setFilter] = useState('live'),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [session, setSession] = useState(null);
  const [syncMeta, setSyncMeta] = useState(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const busy = useRef(false);
  const syncBusy = useRef(false);
  const syncRef = useRef(null);
  const validatedSession = useRef(null);
  const sessionRef = useRef(session);
  const workspaceRef = useRef(w);
  sessionRef.current = session;
  workspaceRef.current = w;
  const offline = useOffline();
  const base = '/app';
  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);
  useEffect(() => {
    // Scoring keeps its revision snapshot so a stale second scorer is rejected.
    if (!w?.id || screen === 'match') return;
    const subscription = liveQuery(() => all(w.id)).subscribe({
      next: setData,
      error: (e) => setError(userError(e)),
    });
    return () => subscription.unsubscribe();
  }, [w?.id, screen]);
  async function refresh() {
    const ws = await workspace();
    setW(ws);
    setData(ws ? await all(ws.id) : null);
    setLoaded(true);
  }
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const currentSession = await getActiveCachedAccountSession();
        const ws = currentSession ? await workspace() : await findGuestWorkspace();
        if (cancelled) return;
        setSession(currentSession ? { ...currentSession, offlineCached: true } : null);
        setW(ws);
        setData(ws ? await all(ws.id) : null);
        if (ws && currentSession) {
          const syncState = await getSyncState(ws.id);
          setSyncMeta(syncState.meta);
          setPendingSync(syncState.pending);
        }
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setError(userError(e));
        setLoaded(true);
      }
    }
    initialize();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !isOnline) return undefined;
    let cancelled = false;
    async function restoreOnlineSession() {
      try {
        const currentSession = await fetchSession();
        if (cancelled) return;
        const previousSession = sessionRef.current;
        if (!currentSession) {
          if (previousSession?.offlineCached) {
            await invalidateCachedAccountSession(workspaceRef.current?.id);
            if (cancelled) return;
            setSession(null);
            setData(null);
            setW(null);
            window.location.assign('/account/login/');
          }
          return;
        }
        const ws = await activateAccountWorkspace(
          currentSession.workspaceKey || currentSession.teamId,
          currentSession.teamName,
          currentSession,
        );
        const localData = await all(ws.id);
        const syncState = await getSyncState(ws.id);
        if (cancelled) return;
        validatedSession.current = currentSession;
        setSession(currentSession);
        setW(ws);
        setData(localData);
        setSyncMeta(syncState.meta);
        setPendingSync(syncState.pending);
      } catch {
        // Keep the local workspace usable when session validation is unavailable.
      }
    }
    void restoreOnlineSession();
    return () => {
      cancelled = true;
    };
  }, [isOnline, loaded]);
  useEffect(() => {
    if (!w?.id || !session) return undefined;
    const handleSignedOut = (workspaceId) => {
      if (workspaceId !== w.id) return;
      setSession(null);
      setData(null);
      setW(null);
      window.location.assign('/account/login/');
    };
    const onStorage = (event) => {
      if (event.key !== 'crease-account-signed-out' || !event.newValue) return;
      try {
        handleSignedOut(JSON.parse(event.newValue).workspaceId);
      } catch (parseError) {
        console.error('Could not process account sign-out notification:', parseError);
      }
    };
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('crease-account-session');
    const onMessage = (event) => {
      if (event.data?.type === 'signed-out') handleSignedOut(event.data.workspaceId);
    };
    channel?.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      channel?.removeEventListener('message', onMessage);
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [session, w?.id]);
  async function refreshSyncState(workspaceId = w?.id) {
    if (!workspaceId) return;
    const state = await getSyncState(workspaceId);
    setSyncMeta(state.meta);
    setPendingSync(state.pending);
  }
  async function syncNow() {
    if (!session || !w || syncBusy.current) return;
    syncBusy.current = true;
    setSyncing(true);
    try {
      let checkedSession = validatedSession.current;
      validatedSession.current = null;
      if (!checkedSession && session.offlineCached) {
        checkedSession = await fetchSession();
        if (!checkedSession) {
          await invalidateCachedAccountSession(w.id);
          setSession(null);
          setData(null);
          setW(null);
          window.location.assign('/account/login/');
          return;
        }
        validatedSession.current = checkedSession;
        setSession(checkedSession);
      }
      const result = await sync(w.id, { session: checkedSession || undefined });
      if (result.status === 'unauthenticated') {
        if (result.session) {
          const nextWorkspace = await activateAccountWorkspace(
            result.session.workspaceKey || result.session.teamId,
            result.session.teamName,
            result.session,
          );
          validatedSession.current = result.session;
          setSession(result.session);
          setW(nextWorkspace);
          setData(await all(nextWorkspace.id));
          await refreshSyncState(nextWorkspace.id);
        } else {
          await invalidateCachedAccountSession(w.id);
          setSession(null);
          setData(null);
          setW(null);
          window.location.assign('/account/login/');
        }
        return;
      }
      if (result.session) setSession(result.session);
      await refreshSyncState(w.id);
      await refresh();
    } catch (e) {
      setError('Sync needs attention. Your local changes are still saved.');
    } finally {
      syncBusy.current = false;
      setSyncing(false);
    }
  }
  syncRef.current = syncNow;
  useEffect(() => {
    if (!loaded || !session || session.offlineCached || !w) return undefined;
    const triggerSync = () => {
      if (document.visibilityState === 'visible') syncRef.current?.();
    };
    triggerSync();
    const interval = window.setInterval(triggerSync, 45000);
    window.addEventListener('online', triggerSync);
    document.addEventListener('visibilitychange', triggerSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', triggerSync);
      document.removeEventListener('visibilitychange', triggerSync);
    };
  }, [loaded, session?.offlineCached, session?.teamId, w?.id]);
  useEffect(() => {
    const closeOthers = (current) => {
      document.querySelectorAll('.header-popover[open]').forEach((menu) => {
        if (menu !== current) menu.open = false;
      });
    };
    const onToggle = (event) => {
      if (event.target.open) closeOthers(event.target);
    };
    const onPointerDown = (event) => {
      if (!event.target.closest('.header-popover')) closeOthers(null);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const openMenu = document.querySelector('.header-popover[open]');
      if (!openMenu) return;
      openMenu.open = false;
      openMenu.querySelector('summary')?.focus();
    };
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  async function run(fn) {
    if (busy.current) return false;
    busy.current = true;
    setError('');
    setStatus('Saving…');
    try {
      const value = await fn();
      await refresh();
      setStatus(session ? 'Waiting to sync' : 'Saved on this device');
      if (session && w) void syncRef.current?.();
      return value === undefined ? true : value;
    } catch (e) {
      console.error('Crease operation failed', e);
      setError(userError(e));
      setStatus('Save failed');
      return false;
    } finally {
      busy.current = false;
    }
  }
  const ctx = { w, data, run, refresh, setError, error, session };
  const canDelete = !session || session.role === 'owner';
  const titles = {
    dashboard: 'Dashboard',
    matches: 'Matches',
    reports: 'Reports',
    statistics: 'Statistics',
    teams: 'Teams',
    players: 'Players',
    more: 'More',
    setup: 'New match',
    match: 'Match centre',
    player: 'Player profile',
  };
  const navItems = [
    { label: 'Dashboard', href: `${base}/`, icon: LayoutDashboard, active: screen === 'dashboard' },
    {
      label: 'Matches',
      href: `${base}/matches/`,
      icon: CalendarDays,
      active: screen === 'matches' || screen === 'match' || screen === 'setup',
    },
    { label: 'Teams', href: `${base}/teams/`, icon: Users, active: screen === 'teams' },
    {
      label: 'Players',
      href: `${base}/players/`,
      icon: UserRound,
      active: screen === 'players' || screen === 'player',
    },
    {
      label: 'Statistics',
      href: `${base}/statistics/`,
      icon: ChartNoAxesCombined,
      active: screen === 'statistics',
    },
    { label: 'Reports', href: `${base}/reports/`, icon: FileText, active: screen === 'reports' },
    { label: 'Settings / More', href: `${base}/more/`, icon: Ellipsis, active: screen === 'more' },
  ];
  const matches = data?.matches ?? [];
  const liveMatches = matches.filter((match) => match.status === 'live');
  const completedMatches = matches.filter((match) => match.status === 'completed');
  const upcoming = upcomingMatches(matches, clock);
  const drafts = data?.drafts ?? [];
  const listedMatches =
    filter === 'upcoming' ? upcoming : matches.filter((m) => m.status === filter);
  const teamStats = useMemo(
    () =>
      new Map(
        (screen === 'dashboard' ? (data?.teams ?? []) : []).map((team) => [
          team.id,
          teamStatistics(team.id, data.matches, data.innings, data.events),
        ]),
      ),
    [data, screen],
  );
  const recentMatches = [...completedMatches]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);
  const currentSyncStatus =
    !isOnline || session?.offlineCached
      ? 'offline'
      : syncMeta?.syncStatus || (session ? 'pending' : 'unauthenticated');
  const currentSyncLabel = SYNC_STATUS_LABELS[currentSyncStatus] || 'Sync needs attention';

  function renderDraftCard(draft) {
    const title = [draft.teamA, draft.teamB]
      .map(
        (id, i) =>
          data.teams.find((t) => t.id === id)?.name ||
          draft[i ? 'teamNameB' : 'teamNameA'] ||
          'Team ' + (i ? 'B' : 'A'),
      )
      .join(' vs ');
    return (
      <div className="dashboard-panel" key={draft.id}>
        <span className="match-status">Draft</span>
        <h3>{title}</h3>
        <p>{draft.rules?.overs || '?'} overs ? Setup saved</p>
        <div className="actions">
          <Link className="button secondary compact" href={`/app/setup/?draft=${draft.id}`}>
            Resume setup
          </Link>
          {canDelete && (
            <Button
              secondary
              compact
              danger
              onClick={() => setDeleting({ table: 'drafts', record: { ...draft, title } })}
            >
              Delete draft
            </Button>
          )}
        </div>
      </div>
    );
  }
  function renderMatchCard(match) {
    const states = ['upcoming', 'cancelled'].includes(match.status)
      ? []
      : matchStates(
          match,
          data.innings.filter((inning) => inning.matchId === match.id),
          data.events.filter((event) => event.matchId === match.id),
        );
    return (
      <div className="match-card-item" key={match.id}>
        <Link className="match-card" href={`${base}/match/?id=${match.id}`}>
          <div className="match-card-topline">
            <span className={`match-status status-${match.status}`}>
              {match.status === 'live' ? (
                <Play size={13} />
              ) : match.status === 'completed' ? (
                <CheckCircle2 size={14} />
              ) : (
                <Clock3 size={14} />
              )}
              {match.status === 'live'
                ? 'Live'
                : match.status === 'completed'
                  ? 'Completed'
                  : match.status === 'cancelled'
                    ? 'Cancelled'
                    : 'Upcoming'}
            </span>
            <small>
              {new Date(match.scheduledAt || match.date).toLocaleString(
                [],
                match.scheduledAt
                  ? { dateStyle: 'medium', timeStyle: 'short' }
                  : { dateStyle: 'medium' },
              )}
            </small>
          </div>
          <div className="match-teams">
            {match.teams.map((team, index) => {
              const state = states[index === match.firstBat ? 0 : 1];
              return (
                <div className="match-team-line" key={team.id}>
                  <strong>{team.name}</strong>
                  <b>{state ? `${state.runs}/${state.wickets}` : '—'}</b>
                </div>
              );
            })}
          </div>
          <div className="match-card-details">
            <span>{match.rules.overs} overs</span>
            <span>{match.venue || 'Local match'}</span>
          </div>
          <div className="card-footer">
            {scheduledAction(match)}
            <ArrowUpRight size={17} />
          </div>
        </Link>
        {canDelete && (
          <Button
            secondary
            compact
            danger
            onClick={() => setDeleting({ table: 'matches', record: match })}
          >
            Delete match
          </Button>
        )}
        {match.status === 'completed' && (
          <div className="match-card-history-action">
            <DownloadScorecardButton match={match} states={states} compact />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`app app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {deleting && (
        <Sheet
          title={deleting.table === 'drafts' ? 'Delete draft?' : 'Delete match?'}
          close={() => setDeleting(null)}
        >
          <p>
            <strong>{deleting.record.title || matchLabel(deleting.record)}</strong>
          </p>
          <p>
            {deleting.table === 'drafts'
              ? 'This saved setup will be removed.'
              : 'This match and its score will be removed from lists and statistics. Historical snapshots are retained for audit. Other matches and players are kept.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <Button secondary onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              danger
              onClick={async () => {
                if (
                  await run(() =>
                    deleting.table === 'drafts'
                      ? deleteRecord(w.id, 'drafts', deleting.record.id)
                      : deleteMatch(w.id, deleting.record.id),
                  )
                )
                  setDeleting(null);
              }}
            >
              Confirm delete
            </Button>
          </div>
        </Sheet>
      )}
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <Link href={`${base}/`} aria-label="Crease dashboard">
            <span className="brand-mark">
              <Leaf size={21} />
            </span>
            <span className="sidebar-brand-name">
              crease<span>.</span>
            </span>
          </Link>
          <button
            className="sidebar-collapse-button"
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="sidebar-section-label">WORKSPACE</p>
          {navItems.map(({ label, href, icon: Icon, active }) => (
            <Link
              key={label}
              href={href}
              className={`sidebar-link ${active ? 'selected' : ''} ${
                ['Statistics', 'Reports'].includes(label) ? 'secondary-nav-item' : ''
              }`}
              aria-current={active ? 'page' : undefined}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-offline-dot" />
          <span className="sidebar-footer-text">Offline-ready scorekeeping</span>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="brand">
          <Link href={`${base}/`} aria-label="Crease home">
            <span className="brand-mark">
              <Leaf size={22} />
            </span>{' '}
            <span className="mobile-brand-name">
              crease<span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="mobile-header-actions">
            <details className={`header-popover sync-popover sync-state-${currentSyncStatus}`}>
              <summary aria-label={`Sync status: ${currentSyncLabel}`} title={currentSyncLabel}>
                <span className="header-status-dot" />
                <Cloud size={17} />
                <span className="offline-readiness-label">
                  {offline.ready ? 'Ready offline' : 'Offline setup'}
                </span>
              </summary>
              <div className="header-popover-panel">
                <SyncStatus
                  status={currentSyncStatus}
                  pending={pendingSync}
                  onSync={session ? syncNow : undefined}
                  syncing={syncing}
                />
              </div>
            </details>
            <details className="header-popover account-popover">
              <summary aria-label="Account menu" title="Account">
                <UserRound size={19} />
              </summary>
              <div className="header-popover-panel account-popover-panel">
                <TeamAccountMenu session={session} workspaceId={w?.id} />
              </div>
            </details>
          </div>
        </header>
        <header className="desktop-topbar">
          <div>
            <span className="desktop-breadcrumb">Crease / {titles[screen] || 'Crease'}</span>
            <h1>{titles[screen] || 'Crease'}</h1>
          </div>
          <div className="desktop-topbar-actions">
            <details className={`header-popover sync-popover sync-state-${currentSyncStatus}`}>
              <summary title={currentSyncLabel}>
                <span className="header-status-dot" />
                <Cloud size={17} />
                <span className="offline-readiness-label">
                  {offline.ready ? 'Ready offline' : 'Offline setup'}
                </span>
              </summary>
              <div className="header-popover-panel">
                <SyncStatus
                  status={currentSyncStatus}
                  pending={pendingSync}
                  onSync={session ? syncNow : undefined}
                  syncing={syncing}
                />
              </div>
            </details>
            {w && ['dashboard', 'matches'].includes(screen) && (
              <Link className="button compact" href={`${base}/setup/?new=1`}>
                <Plus size={17} /> New match
              </Link>
            )}
            <details className="header-popover account-popover">
              <summary title={session?.teamName || 'Account'}>
                <UserRound size={17} />
                <span>{session?.teamName || 'Account'}</span>
              </summary>
              <div className="header-popover-panel account-popover-panel">
                <TeamAccountMenu session={session} workspaceId={w?.id} />
              </div>
            </details>
          </div>
        </header>
        <main className={`app-content ${screen === 'setup' ? 'setup-page-content' : ''}`}>
          {['dashboard', 'matches', 'reports', 'statistics'].includes(screen) ? (
            <div className="page-heading mobile-page-heading">
              <div>
                <p className="eyebrow">YOUR GAME. YOUR RECORD.</p>
                <h1>{titles[screen]}</h1>
              </div>
              {['dashboard', 'matches'].includes(screen) && w && (
                <Link className="button compact" href={`${base}/setup/?new=1`}>
                  <Plus size={18} /> New match
                </Link>
              )}
            </div>
          ) : (
            <div className="page-heading mobile-page-heading">
              <div>
                <p className="eyebrow">YOUR GAME. YOUR RECORD.</p>
                <h1>{titles[screen]}</h1>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="notice error">
              {error}
              <button
                onClick={() =>
                  refresh()
                    .then(() => setError(''))
                    .catch((e) => setError(userError(e)))
                }
              >
                Refresh records
              </button>
            </div>
          )}
          {status && (
            <div role="status" className={`save-status ${status === 'Save failed' ? 'red' : ''}`}>
              {status}
            </div>
          )}
          {!loaded ? (
            <ScreenSkeleton screen={screen} />
          ) : !w ? (
            <section className="welcome">
              <span className="pill">WELCOME TO YOUR CREASE</span>
              <h2>
                Every ball.
                <br />
                Every little victory.
              </h2>
              <p>
                Your teams, matches and statistics, together in one place. Ready for the ground,
                even without a signal.
              </p>
              <div className="card">
                <h3>A workspace of your own</h3>
                <p>
                  Records stay in this browser on this device. Your display name is not a login.
                  Anyone using this browser profile can access these records.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(() => createWorkspace(name));
                  }}
                >
                  <Field
                    label="Your scorer name"
                    value={name}
                    maxLength={100}
                    required
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Button>
                    Get started <ArrowUpRight size={18} />
                  </Button>
                </form>
              </div>
            </section>
          ) : (
            data && (
              <>
                {screen === 'dashboard' && (
                  <section className="dashboard-view">
                    <div className="dashboard-welcome">
                      <div>
                        <p className="dashboard-kicker">Welcome back, {w.name}</p>
                        <h2>Your cricket, at a glance.</h2>
                      </div>
                    </div>
                    <div className="dashboard-stat-grid">
                      {[
                        ['Total matches', matches.length, CalendarDays],
                        ['Live matches', liveMatches.length, Play],
                        ['Completed', completedMatches.length, CheckCircle2],
                        ['Teams', data.teams.filter((team) => !team.archived).length, Users],
                      ].map(([label, value, Icon]) => (
                        <div className="dashboard-stat-card" key={label}>
                          <span className="dashboard-stat-icon">
                            <Icon size={19} />
                          </span>
                          <strong>{value}</strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    {liveMatches.length > 0 && (
                      <section className="dashboard-panel">
                        <h2>Live matches</h2>
                        <div className="match-grid">{liveMatches.map(renderMatchCard)}</div>
                      </section>
                    )}
                    <section className="dashboard-panel">
                      <h2>Upcoming matches</h2>
                      {upcoming.length ? (
                        <div className="match-grid">
                          {upcoming.slice(0, 4).map(renderMatchCard)}
                        </div>
                      ) : (
                        <p className="dashboard-empty-note">
                          No scheduled matches.{' '}
                          <Link href="/app/setup/?new=1">Schedule a match</Link>
                        </p>
                      )}
                    </section>
                    {drafts.length > 0 && (
                      <section className="dashboard-panel">
                        <h2>Draft matches</h2>
                        <div className="match-grid">{drafts.map(renderDraftCard)}</div>
                      </section>
                    )}
                    <div className="dashboard-main-grid">
                      <section className="dashboard-panel dashboard-recent">
                        <div className="dashboard-panel-heading">
                          <div>
                            <h2>Recent matches</h2>
                            <p>Your latest scorebook activity</p>
                          </div>
                          <Link href={`${base}/matches/`}>
                            All matches <ArrowRight size={15} />
                          </Link>
                        </div>
                        {liveMatches.length > 0 && (
                          <div className="continue-scoring">
                            <span className="live-pulse" />
                            <div>
                              <strong>Continue scoring</strong>
                              <small>
                                {liveMatches.length} match{liveMatches.length === 1 ? '' : 'es'} in
                                progress
                              </small>
                            </div>
                            <Link
                              className="button compact"
                              href={`${base}/match/?id=${liveMatches[0].id}`}
                            >
                              Resume
                            </Link>
                          </div>
                        )}
                        {recentMatches.length ? (
                          <div className="match-grid dashboard-match-grid">
                            {recentMatches.map(renderMatchCard)}
                          </div>
                        ) : (
                          <Empty
                            title={
                              matches.length
                                ? 'No completed matches yet'
                                : 'Your scorebook starts here'
                            }
                            href={`${base}/setup/?new=1`}
                            action="Set up a match"
                          >
                            {matches.length
                              ? 'Completed scorecards will appear here.'
                              : 'Create a match to start building your local cricket history.'}
                          </Empty>
                        )}
                      </section>
                      <aside className="dashboard-side-column">
                        {data.teams.some((team) => !team.archived) && (
                          <section className="dashboard-panel">
                            <div className="dashboard-panel-heading">
                              <div>
                                <h2>Team performance</h2>
                                <p>Completed matches only</p>
                              </div>
                            </div>
                            {data.teams
                              .filter((team) => !team.archived)
                              .slice(0, 4)
                              .map((team) => {
                                const stats = teamStats.get(team.id);
                                return (
                                  <Link
                                    className="performance-row"
                                    key={team.id}
                                    href={`${base}/statistics/`}
                                  >
                                    <span>
                                      <strong>{team.name}</strong>
                                      <small>
                                        {stats.matches} matches · {stats.won} wins
                                      </small>
                                    </span>
                                    <b>
                                      {stats.winPercentage === null
                                        ? '—'
                                        : `${stats.winPercentage.toFixed(0)}%`}
                                    </b>
                                  </Link>
                                );
                              })}
                            {!data.teams.length && (
                              <p className="dashboard-empty-note">
                                Add a team to see its match record here.
                              </p>
                            )}
                          </section>
                        )}
                        <section className="dashboard-panel quick-actions-panel">
                          <div className="dashboard-panel-heading">
                            <div>
                              <h2>Quick actions</h2>
                              <p>Pick up where you left off</p>
                            </div>
                          </div>
                          <Link className="quick-action-link" href={`${base}/setup/?new=1`}>
                            <Plus size={18} />
                            <span>Start a new match</span>
                            <ArrowRight size={15} />
                          </Link>
                          <Link className="quick-action-link" href={`${base}/teams/`}>
                            <Users size={18} />
                            <span>Manage teams</span>
                            <ArrowRight size={15} />
                          </Link>
                          <Link className="quick-action-link" href={`${base}/players/`}>
                            <UserRound size={18} />
                            <span>Manage players</span>
                            <ArrowRight size={15} />
                          </Link>
                        </section>
                      </aside>
                    </div>
                  </section>
                )}
                {screen === 'matches' && (
                  <section className="matches-view">
                    <div className="tabs" aria-label="Match status">
                      {['live', 'upcoming', 'drafts', 'completed', 'cancelled'].map((value) => (
                        <button
                          key={value}
                          className={filter === value ? 'active' : ''}
                          onClick={() => setFilter(value)}
                        >
                          {value[0].toUpperCase() + value.slice(1)}{' '}
                          <span>
                            {value === 'drafts'
                              ? drafts.length
                              : value === 'upcoming'
                                ? upcoming.length
                                : matches.filter((match) => match.status === value).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="match-grid">
                      {filter === 'drafts' && drafts.length ? (
                        drafts.map(renderDraftCard)
                      ) : listedMatches.length ? (
                        listedMatches.map(renderMatchCard)
                      ) : (
                        <Empty
                          title={
                            filter === 'completed'
                              ? 'No completed matches yet'
                              : 'No matches here yet'
                          }
                          href={`${base}/setup/?new=1`}
                          action="Set up a match"
                        >
                          {filter === 'live'
                            ? 'Start a match to see live scoring here.'
                            : filter === 'upcoming'
                              ? 'Schedule a match from setup to see it here.'
                              : 'Completed matches and their scorecards will appear here.'}
                        </Empty>
                      )}
                    </div>
                  </section>
                )}
                {screen === 'reports' && (
                  <section className="reports-view">
                    <div className="dashboard-panel-heading reports-heading">
                      <div>
                        <h2>Match reports</h2>
                        <p>Open a scorecard to print or save its report.</p>
                      </div>
                    </div>
                    <div className="match-grid">
                      {completedMatches.length ? (
                        completedMatches.map(renderMatchCard)
                      ) : (
                        <Empty title="No reports yet">
                          Finalized match scorecards and report exports will appear here.
                        </Empty>
                      )}
                    </div>
                  </section>
                )}
                {['teams', 'players'].includes(screen) && <People {...ctx} screen={screen} />}
                {screen === 'statistics' && <Statistics data={data} />}
                {screen === 'setup' && <Setup {...ctx} />}
                {screen === 'match' && <Match {...ctx} />}
                {screen === 'player' && <Profile {...ctx} />}
                {screen === 'more' && (
                  <Settings
                    {...ctx}
                    offline={offline}
                    session={session}
                    workspaceId={w.id}
                    syncStatus={!isOnline ? 'offline' : syncMeta?.syncStatus || 'pending'}
                    pendingSync={pendingSync}
                    syncing={syncing}
                    onSync={syncNow}
                  />
                )}
              </>
            )
          )}
        </main>
        <nav className="bottom-nav" aria-label="Main navigation">
          {[
            ['Dashboard', `${base}/`, Home, screen === 'dashboard'],
            [
              'Matches',
              `${base}/matches/`,
              CalendarDays,
              screen === 'matches' || screen === 'match' || screen === 'setup',
            ],
            ['Teams', `${base}/teams/`, Users, screen === 'teams'],
            ['Players', `${base}/players/`, UserRound, screen === 'players' || screen === 'player'],
            [
              'More',
              `${base}/more/`,
              Ellipsis,
              screen === 'more' || screen === 'statistics' || screen === 'reports',
            ],
          ].map(([label, href, Icon, active]) => (
            <Link key={label} href={href} className={active ? 'selected' : ''}>
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
