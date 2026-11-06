import PublicSite from '../../components/PublicSite';
import { publicMetadata } from '../../lib/seo';
export const metadata = publicMetadata({ title: 'About Crease | Cricket Scoring for Local Matches', description: 'Learn why Crease was created to make local cricket scoring simple, organized and reliable, even without a connection.', path: '/about/' });
export default function Page() {
  return <PublicSite page="about" />;
}
