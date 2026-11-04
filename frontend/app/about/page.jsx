import PublicSite from '../../components/PublicSite';
export const metadata = {
  title: 'About Crease | Built for Local Cricket Scoring',
  description:
    'Learn why Crease was created to make cricket scoring simple, organized and reliable for local matches, including offline scoring.',
  alternates: { canonical: '/about/' },
};
export default function Page() {
  return <PublicSite page="about" />;
}
