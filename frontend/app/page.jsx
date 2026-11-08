import PublicSite from '../components/PublicSite';
import { publicMetadata } from '../lib/seo';
export const metadata = publicMetadata({ title: 'Crease — Free Cricket Scoring App | Score Matches Offline', description: 'Score cricket matches ball by ball with Crease, a free offline cricket scoring app. Manage teams, track player stats, and create detailed scorecards.', path: '/' });
export default function Page() {
  return <PublicSite />;
}
