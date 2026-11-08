export const siteUrl = 'https://creaseweb.com';

export function softwareApplicationSchema({
  title = 'Crease',
  description = 'Crease is a free cricket scoring app for local matches, offline scoring, team management and scorecards.',
  url = siteUrl,
  featureList = [
    'Ball-by-ball cricket scoring',
    'Offline match scoring',
    'Team and player management',
    'Match statistics and scorecards',
    'Match history and scorebook exports',
  ],
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: title,
    applicationCategory: 'SportsApplication',
    operatingSystem: ['Web browser', 'Android', 'iOS', 'Windows', 'macOS'],
    description,
    url,
    isAccessibleForFree: true,
    browserRequirements: 'Requires a modern web browser and supports installation as a PWA for offline use.',
    featureList,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    screenshot: `${siteUrl}/marketing/scoring-desktop-2x.webp`,
    softwareVersion: 'Current',
  };
}

export function webPageSchema({
  title,
  description,
  url,
  pageType = 'WebPage',
  mainEntity = null,
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': pageType,
    name: title,
    description,
    url,
    ...(mainEntity ? { mainEntity } : {}),
  };
}

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
