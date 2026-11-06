import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Install the Crease Cricket Scoring App', description: 'Learn how to install the Crease PWA on supported Android, iPhone, iPad and desktop browsers for offline cricket scoring.', path: '/download/' });
export default function Page() { return <PublicSite page="download" />; }
