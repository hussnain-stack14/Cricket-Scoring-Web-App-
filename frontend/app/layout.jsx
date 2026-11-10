import './globals.css';
import './marketing.css';
import './marketing-fixes.css';
import './home.css';
import './download.css';
import InlineScript from '../components/InlineScript';
import ThemeController from '../components/ThemeController';
import PwaInstallCapture from '../components/PwaInstallCapture';
import { siteUrl } from '../lib/seo';
export const metadata = {
  metadataBase: new URL(siteUrl),
  ...(process.env.VERCEL_ENV === 'preview' ? { robots: { index: false, follow: false } } : {}),
  title: 'Crease — Free Cricket Scoring App | Score Matches Offline',
  description: 'Score cricket matches ball by ball with Crease, a free offline cricket scoring app. Manage teams, track player stats, and create detailed scorecards.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32-v2.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16-v2.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/crease-app-icon-v2.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon-v2.png',
  },
  appleWebApp: { capable: true, title: 'Crease', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: 'Crease',
    title: 'Crease — Free Cricket Scoring App | Score Matches Offline',
    description: 'Score cricket matches ball by ball with Crease, a free offline cricket scoring app. Manage teams, track player stats, and create detailed scorecards.',
    url: siteUrl,
    images: [{ url: '/crease-social.png', width: 1200, height: 630, alt: 'Crease cricket scoring app' }],
  },
  twitter: { card: 'summary_large_image', title: 'Crease — Free Cricket Scoring App | Score Matches Offline', description: 'Score cricket matches ball by ball with Crease, a free offline cricket scoring app. Manage teams, track player stats, and create detailed scorecards.', images: ['/crease-social.png'] },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06452D',
};
export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <InlineScript
          id="crease-theme-init"
          code="try{const t=localStorage.getItem('crease-theme');if(t==='red-ball'||t==='blue')document.documentElement.dataset.theme=t}catch(e){}"
        />
        <ThemeController />
        <PwaInstallCapture />
        {children}
      </body>
    </html>
  );
}
