'use client';
import { AlertCircle, Cloud, CloudOff, RefreshCw, Shield } from 'lucide-react';

export const SYNC_STATUS_LABELS = {
  synced: 'All changes synced',
  pending: 'Waiting to sync',
  conflict: 'Sync needs attention',
  attention: 'Sync needs attention',
  offline: 'Offline – saved on this device',
  syncing: 'Syncing…',
  unauthenticated: 'Sign in to sync',
};

const STATUS_ICONS = {
  synced: Cloud,
  pending: RefreshCw,
  conflict: AlertCircle,
  attention: AlertCircle,
  offline: CloudOff,
  syncing: RefreshCw,
  unauthenticated: Shield,
};

export default function SyncStatus({ status, pending = 0, onSync, syncing = false, compact = false }) {
  const key = SYNC_STATUS_LABELS[status] ? status : 'attention';
  const Icon = STATUS_ICONS[key];
  return (
    <div className={`sync-status-bar sync-${key} ${compact ? 'sync-status-compact' : ''}`}>
      <Icon size={16} className={syncing || key === 'syncing' ? 'spin' : ''} />
      <span>{SYNC_STATUS_LABELS[key]}</span>
      {pending > 0 && <small>{pending} pending</small>}
      {onSync && (
        <button className="button compact secondary" onClick={onSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
