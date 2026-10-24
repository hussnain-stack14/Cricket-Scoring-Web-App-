'use client';
import { useEffect, useState } from 'react';
export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={'skeleton ' + className} />;
}
export function MatchCardSkeleton() {
  return (
    <div className="match-card skeleton-card">
      <Skeleton className="sk-short" />
      <Skeleton className="sk-title" />
      <Skeleton className="sk-title" />
      <Skeleton className="sk-line" />
      <Skeleton className="sk-action" />
    </div>
  );
}
export function PlayerCardSkeleton() {
  return (
    <div className="person-row">
      <Skeleton className="sk-avatar" />
      <div className="grow">
        <Skeleton className="sk-title" />
        <Skeleton className="sk-line" />
        <Skeleton className="sk-short" />
      </div>
    </div>
  );
}
export const TeamCardSkeleton = PlayerCardSkeleton;
export function TableSkeleton() {
  return (
    <div className="skeleton-table">
      {[0, 1, 2].map((row) => (
        <div key={row}>
          <Skeleton className="sk-title" />
          {[0, 1, 2, 3, 4].map((col) => (
            <Skeleton key={col} className="sk-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}
export function ScoreboardSkeleton() {
  return (
    <div className="score-panel skeleton-scoreboard">
      <Skeleton className="sk-short" />
      <Skeleton className="sk-title" />
      <Skeleton className="sk-score" />
      <div className="score-metrics">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="sk-metric" />
        ))}
      </div>
    </div>
  );
}
export function MatchCentreSkeleton() {
  return (
    <>
      <Skeleton className="sk-heading" />
      <Skeleton className="sk-line" />
      <div className="sk-tabs">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <div className="live-score-layout">
        <div>
          <ScoreboardSkeleton />
          <TableSkeleton />
        </div>
        <div className="skeleton-controls">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
export function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="sk-heading" />
      <div className="dashboard-stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="dashboard-stat-card" key={i}>
            <Skeleton className="sk-title" />
            <Skeleton className="sk-line" />
          </div>
        ))}
      </div>
      {['Live', 'Upcoming', 'Drafts'].map((label) => (
        <section className="dashboard-panel" key={label}>
          <Skeleton className="sk-title" />
          <div className="match-grid">
            <MatchCardSkeleton />
            <MatchCardSkeleton />
          </div>
        </section>
      ))}
    </>
  );
}
export function StatisticsSkeleton() {
  return (
    <>
      <Skeleton className="sk-heading" />
      <div className="dashboard-stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="sk-stat" />
        ))}
      </div>
      <TableSkeleton />
    </>
  );
}
// Debounce only the placeholder, never cached content or a data request.
export default function ScreenSkeleton({ screen = 'dashboard', immediate = false }) {
  const [visible, setVisible] = useState(immediate);
  useEffect(() => {
    if (immediate) return;
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [immediate]);
  if (!visible) return null;
  return (
    <div
      className="screen-skeleton"
      role="status"
      aria-label={'Loading ' + screen}
      aria-busy="true"
    >
      <span className="sr-only">Loading {screen}...</span>
      <div aria-hidden="true">
        {screen === 'dashboard' ? (
          <DashboardSkeleton />
        ) : ['match', 'scorecard'].includes(screen) ? (
          <MatchCentreSkeleton />
        ) : ['players', 'player', 'teams', 'account'].includes(screen) ? (
          <>
            <Skeleton className="sk-heading" />
            {[0, 1, 2, 3].map((i) => (
              <PlayerCardSkeleton key={i} />
            ))}
          </>
        ) : screen === 'statistics' ? (
          <StatisticsSkeleton />
        ) : (
          <>
            <Skeleton className="sk-heading" />
            <div className="match-grid">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
