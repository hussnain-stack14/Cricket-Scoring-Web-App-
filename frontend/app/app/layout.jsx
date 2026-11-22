import AppRouteShell from '../../components/AppRouteShell';

export const metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }) {
  return <AppRouteShell>{children}</AppRouteShell>;
}
