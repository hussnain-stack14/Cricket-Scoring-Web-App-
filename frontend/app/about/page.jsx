import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'About Crease | Free Cricket Scoring App', description: 'Learn how Crease helps local cricketers score matches, manage teams and keep scorecards organized without needing a constant connection.', path: '/about/' });
export default function Page() {
  return <PublicSite page="about" />;
}
