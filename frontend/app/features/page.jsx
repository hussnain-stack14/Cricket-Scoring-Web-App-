import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Cricket Scoring Features | Crease', description: 'Score every ball, manage teams, review scorecards, and track cricket player stats with Crease offline.', path: '/features/' });
export default function Page() { return <PublicSite page="features" />; }
