import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Terms | Crease', description: 'Read the current Crease terms and important product limitations.', path: '/terms/' });
export default function Page() { return <PublicSite page="terms" />; }
