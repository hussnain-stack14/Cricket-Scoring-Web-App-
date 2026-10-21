import './globals.css';
export const metadata = {
  title: 'Crease · Your game, recorded',
  description: 'Offline cricket scoring, teams and player statistics on your device.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Crease', statusBarStyle: 'default' },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#164F35',
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
