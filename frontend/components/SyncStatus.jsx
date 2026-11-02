'use client';
import { AlertCircle, CheckCircle2, Cloud, CloudOff, RefreshCw, Shield } from 'lucide-react';

export const SYNC_STATUS_LABELS = {
  synced: 'Cloud synced',
  pending: 'Changes pending',
  incomplete: 'Sync incomplete',
  conflict: 'Conflict needs attention',
  attention: 'Sync failed',
  offline: 'Device offline',
  syncing: 'Syncing changes',
  unauthenticated: 'Sign in to sync',
};

const STATUS_DETAILS = {
  incomplete: 'A completed match is waiting for its innings or deliveries. It will retry automatically.',
  conflict: 'Both histories are preserved. Review the conflict before choosing a version.',
  attention: 'Your local changes remain saved. Retry when the connection is available.',
  offline: 'Scoring remains available on this device. Reconnect to upload local changes.',
  pending: 'Changes are saved locally and waiting to be confirmed by the cloud.',
  syncing: 'Your local changes are being confirmed by the cloud.',
  synced: 'All local changes have been confirmed by the cloud.',
  unauthenticated: 'Sign in to synchronize this device with your account.',
};

const STATUS_ICONS = {
  synced: CheckCircle2,
  pending: Cloud,
  incomplete: AlertCircle,
  conflict: AlertCircle,
  attention: AlertCircle,
  offline: CloudOff,
  syncing: RefreshCw,
  unauthenticated: Shield,
};

function timestamp(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : 'Not synced yet';
}

export default function SyncStatus({
  status,
  pending = 0,
  lastSuccessfulSync,
  error,
  onSync,
  syncing = false,
  compact = false,
  variant = 'inline',
  online = true,
  offlineReady = false,
}) {
  const key = SYNC_STATUS_LABELS[status] ? status : 'attention';
  const Icon = STATUS_ICONS[key];
  const manualSyncAvailable = typeof onSync === 'function' && key !== 'unauthenticated';
  const syncDisabled = !online || syncing || key === 'unauthenticated' || key === 'offline';

  if (variant === 'popover') {
    return (
      <section className={`sync-popover-content sync-${key}`} aria-label="Sync and offline status">
        <header className="sync-popover-header">
          <span className="sync-popover-icon" aria-hidden="true">
            <Icon size={18} className={syncing || key === 'syncing' ? 'spin' : ''} />
          </span>
          <span className="sync-popover-heading">
            <strong>Sync &amp; offline</strong>
            <small>{offlineReady ? 'Offline scoring ready' : 'Offline setup in progress'}</small>
          </span>
          <span className={`sync-popover-badge sync-badge-${key}`}>{SYNC_STATUS_LABELS[key]}</span>
        </header>

        <dl className="sync-popover-details">
          <div>
            <dt>Cloud connection</dt>
            <dd>{online ? (key === 'offline' ? 'Checking connection' : 'Online') : 'Offline'}</dd>
          </div>
          <div>
            <dt>Pending changes</dt>
            <dd>{pending > 0 ? `${pending} ${pending === 1 ? 'change' : 'changes'}` : 'None'}</dd>
          </div>
          <div>
            <dt>Last cloud sync</dt>
            <dd>{timestamp(lastSuccessfulSync)}</dd>
          </div>
        </dl>

        {error && <p className="sync-popover-error" role="alert">{error}</p>}
        {manualSyncAvailable && (
          <button
            className="button sync-popover-action"
            type="button"
            onClick={onSync}
            disabled={syncDisabled}
            aria-describedby={!online ? 'sync-offline-help' : undefined}
          >
            <RefreshCw size={16} className={syncing ? 'spin' : ''} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        <p className="sync-popover-footer" id={!online ? 'sync-offline-help' : undefined}>
          {!online && manualSyncAvailable
            ? 'Cloud sync requires an internet connection. Your local changes remain safe.'
            : STATUS_DETAILS[key]}
        </p>
      </section>
    );
  }

  return (
    <div className={`sync-status-bar sync-${key} ${compact ? 'sync-status-compact' : ''}`}>
      <Icon size={16} className={syncing || key === 'syncing' ? 'spin' : ''} />
      <span>{SYNC_STATUS_LABELS[key]}</span>
      {pending > 0 && <small>{pending} pending</small>}
      {!compact && <small>{key === 'offline' ? 'Offline scoring ready' : 'Offline Ready'}</small>}
      {!compact && STATUS_DETAILS[key] && <small>{STATUS_DETAILS[key]}</small>}
      {!compact && lastSuccessfulSync && <small>Last cloud sync {timestamp(lastSuccessfulSync)}</small>}
      {!compact && error && <small role="alert">{error}</small>}
      {manualSyncAvailable && (
        <button className="button compact secondary" type="button" onClick={onSync} disabled={syncDisabled}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
