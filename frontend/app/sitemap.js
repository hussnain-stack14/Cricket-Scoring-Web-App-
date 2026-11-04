const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://crease-scoring.vercel.app';
export default function sitemap() {
  return ['', '/features/', '/how-it-works/', '/download/', '/about/', '/help/', '/privacy/', '/terms/'].map((path, index) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : 0.7,
  }));
}
