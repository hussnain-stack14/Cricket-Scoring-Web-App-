import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'How Cricket Scoring Works | Crease', description: 'Set up teams and a match, record each delivery, then review the scorecard and player statistics with Crease.', path: '/how-it-works/' });
export default function Page() { return <PublicSite page="how" />; }
