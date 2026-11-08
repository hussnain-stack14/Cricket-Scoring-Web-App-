import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'How Cricket Scoring Works | Crease', description: 'Learn the simple workflow for setting up a match, scoring every ball and reviewing a complete cricket scorecard in Crease.', path: '/how-it-works/' });
export default function Page() { return <PublicSite page="how" />; }
