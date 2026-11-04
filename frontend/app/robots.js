export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app/', '/account/', '/api/'] },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://crease-scoring.vercel.app'}/sitemap.xml`,
  };
}
