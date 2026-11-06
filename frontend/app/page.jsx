import PublicSite from '../components/PublicSite';
import { publicMetadata } from '../lib/seo';
export const metadata = publicMetadata({ title: 'Crease — Free Cricket Scoring App | Score Matches Offline', description: 'Score cricket matches ball by ball, manage teams, track player statistics and keep complete scorecards. Score offline with Crease.', path: '/' });
export default function Page() {
  return <PublicSite />;
}
