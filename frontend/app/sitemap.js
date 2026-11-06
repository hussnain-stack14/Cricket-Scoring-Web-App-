import { siteUrl } from '../lib/seo';
export default function sitemap() {
  return ['', '/features/', '/how-it-works/', '/download/', '/about/', '/help/', '/privacy/', '/terms/'].map((path, index) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : 0.7,
  }));
}
