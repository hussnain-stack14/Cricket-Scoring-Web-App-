'use client';

import { usePathname } from 'next/navigation';
import App from './App';

const screens = {
  '/app': 'dashboard',
  '/app/matches': 'matches',
  '/app/teams': 'teams',
  '/app/players': 'players',
  '/app/player': 'player',
  '/app/match': 'match',
  '/app/setup': 'setup',
  '/app/reports': 'reports',
  '/app/statistics': 'statistics',
  '/app/more': 'more',
};

export default function AppRouteShell({ children }) {
  const pathname = usePathname()?.replace(/\/+$/, '') || '/app';

  return (
    <>
      <App screen={screens[pathname] || 'dashboard'} />
      {children}
    </>
  );
}
