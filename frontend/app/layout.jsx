import './globals.css';
import ThemeController from '../components/ThemeController';
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
  themeColor: '#166534',
};
export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('crease-theme');if(t==='red-ball'||t==='blue')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body>
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
