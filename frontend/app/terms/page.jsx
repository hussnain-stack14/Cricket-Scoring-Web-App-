import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'Terms of Service | Crease', description: 'Review the current Crease terms and important product limitations for cricket scoring, data handling and app use.', path: '/terms/' });
export default function Page() { return <PublicSite page="terms" />; }
