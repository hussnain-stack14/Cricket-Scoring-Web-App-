import './globals.css';
import ThemeController from '../components/ThemeController';
export const metadata = {
  title: 'Crease · Your game, recorded',
  description: 'Offline cricket scoring, teams and player statistics on your device.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Crease', statusBarStyle: 'default' },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1F5A3D',
};
export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('crease-theme')==='red-ball')document.documentElement.dataset.theme='red-ball'}catch(e){}" }} />
      </head>
      <body>
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
