import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Privacy | Crease', description: 'Read how Crease handles local scorebooks, account synchronization and cricket scoring data.', path: '/privacy/' });
export default function Page() { return <PublicSite page="privacy" />; }
