import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Install Crease: Free Cricket Scoring App', description: 'Install Crease on Android, iPhone, iPad and desktop browsers for free offline cricket scoring and local match management.', path: '/download/' });
export default function Page() { return <PublicSite page="download" />; }
