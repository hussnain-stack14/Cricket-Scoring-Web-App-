import { siteUrl } from '../lib/seo';

export default function robots() {
  if (process.env.VERCEL_ENV === 'preview') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
