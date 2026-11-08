import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Crease Help Centre | Cricket Scoring Support', description: 'Get help with match scoring, offline use, team setup, backups, scorecards and common support questions in Crease.', path: '/help/' });
export default function Page() { return <PublicSite page="help" />; }
