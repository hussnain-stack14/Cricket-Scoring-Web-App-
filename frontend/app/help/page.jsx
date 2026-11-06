import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Crease Help Centre', description: 'Find practical help for match scoring, teams, player statistics, offline use, backups and troubleshooting.', path: '/help/' });
export default function Page() { return <PublicSite page="help" />; }
