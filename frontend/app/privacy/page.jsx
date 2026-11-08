import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Privacy Policy | Crease', description: 'Read how Crease handles local scorebooks, account sync, and match data while keeping cricket scoring records secure.', path: '/privacy/' });
export default function Page() { return <PublicSite page="privacy" />; }
