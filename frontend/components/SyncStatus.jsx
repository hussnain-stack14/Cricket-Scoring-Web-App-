'use client';
import { AlertCircle, Cloud, CloudOff, RefreshCw, Shield } from 'lucide-react';

export const SYNC_STATUS_LABELS = {
  synced: 'Synced to cloud',
  pending: 'Saved locally',
  incomplete: 'Sync incomplete',
  conflict: 'Conflict needs attention',
  attention: 'Sync failed',
  offline: 'Offline',
  syncing: 'Uploading',
  unauthenticated: 'Sign in to sync',
};

const STATUS_DETAILS = {
  incomplete:
    'A completed match is waiting for its innings or deliveries. It will retry automatically.',
  conflict: 'Both histories are preserved. Review the conflict before choosing a version.',
  attention: 'Your local changes remain saved. Retry when the connection is available.',
  offline: 'This device is ready for offline scoring.',
};

const STATUS_ICONS = {
  synced: Cloud,
  pending: RefreshCw,
  incomplete: AlertCircle,
  conflict: AlertCircle,
  attention: AlertCircle,
  offline: CloudOff,
  syncing: RefreshCw,
  unauthenticated: Shield,
};

export default function SyncStatus({
  status,
  pending = 0,
  lastSuccessfulSync,
  error,
  onSync,
  syncing = false,
  compact = false,
}) {
  const key = SYNC_STATUS_LABELS[status] ? status : 'attention';
  const Icon = STATUS_ICONS[key];
  return (
    <div className={`sync-status-bar sync-${key} ${compact ? 'sync-status-compact' : ''}`}>
      <Icon size={16} className={syncing || key === 'syncing' ? 'spin' : ''} />
      <span>{SYNC_STATUS_LABELS[key]}</span>
      {pending > 0 && <small>{pending} pending</small>}
      {!compact && <small>{key === 'offline' ? 'Offline copy in use' : 'Offline Ready'}</small>}
      {!compact && STATUS_DETAILS[key] && <small>{STATUS_DETAILS[key]}</small>}
      {!compact && lastSuccessfulSync && (
        <small>Cloud Synced {new Date(lastSuccessfulSync).toLocaleString()}</small>
      )}
      {!compact && error && <small role="alert">{error}</small>}
      {onSync && (
        <button className="button compact secondary" onClick={onSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
