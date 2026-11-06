import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Cricket Scoring Features | Crease', description: 'Explore ball-by-ball scoring, scorecards, teams, player statistics, offline scoring and JSON backups in Crease.', path: '/features/' });
export default function Page() { return <PublicSite page="features" />; }
