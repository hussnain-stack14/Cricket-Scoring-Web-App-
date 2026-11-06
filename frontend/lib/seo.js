export const siteUrl = 'https://creaseweb.com';

export function publicMetadata({ title, description, path }) {
  const url = `${siteUrl}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'Crease',
      title,
      description,
      url,
      images: [{ url: '/crease-social.png', width: 1200, height: 630, alt: 'Crease cricket scoring app' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/crease-social.png'] },
  };
}
