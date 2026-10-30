import './globals.css';
export const metadata = {
  title: 'Crease · Your game, recorded',
  description: 'Offline cricket scoring, teams and player statistics on your device.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/main-logo.png',
    apple: '/icons/main-logo.png',
  },
  appleWebApp: { capable: true, title: 'Crease', statusBarStyle: 'default' },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#B91C1C',
};
export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        {children}
      </body>
    </html>
  );
}
