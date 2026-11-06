import { test, expect } from '@playwright/test';

const publicPages = [
  ['/', 'Crease — Free Cricket Scoring App | Score Matches Offline'],
  ['/features/', 'Cricket Scoring Features | Crease'],
  ['/how-it-works/', 'How Cricket Scoring Works | Crease'],
  ['/download/', 'Install the Crease Cricket Scoring App'],
  ['/about/', 'About Crease | Cricket Scoring for Local Matches'],
  ['/help/', 'Crease Help Centre'],
  ['/privacy/', 'Privacy | Crease'],
  ['/terms/', 'Terms | Crease'],
];

test('public pages expose unique metadata and production canonical URLs', async ({ page }) => {
  for (const [path, title] of publicPages) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    expect((await page.locator('meta[name="description"]').getAttribute('content')).length).toBeGreaterThan(40);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://creaseweb.com${path}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://creaseweb.com/crease-social.png');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  }
});

test('robots, sitemap and social image contain only intended public resources', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain('Sitemap: https://creaseweb.com/sitemap.xml');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  for (const [path] of publicPages) expect(xml).toContain(`https://creaseweb.com${path}`);
  expect(xml).not.toContain('/app/');
  expect(xml).not.toContain('/account/');

  const image = await request.get('/crease-social.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('private and legacy application routes are explicitly noindex', async ({ page }) => {
  for (const path of ['/app/', '/app/matches/', '/account/login/', '/account/settings/', '/match/', '/teams/']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});
