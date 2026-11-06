import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const publicRoutes = [
  ['/', 'Every Ball.'],
  ['/features/', 'Every detail of the game. One scorebook.'],
  ['/how-it-works/', 'From setup to the final result.'],
  ['/download/', 'Bring the scorebook to the ground.'],
  ['/about/', 'Built for the game we play.'],
  ['/help/', 'Find the next step, quickly.'],
  ['/privacy/', 'Your scorebook, explained clearly.'],
  ['/terms/', 'Using Crease responsibly.'],
];

test('homepage uses real local-demo screens, truthful offline messaging and working actions', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Every Ball. Every Moment.' })).toBeVisible();
    await expect(page.locator('.home-live-controls-crop img')).toHaveAttribute('src', '/marketing/scoring-mobile-2x.webp');
    await expect(page.locator('.home-scorecard img').first()).toHaveAttribute('src', '/marketing/scorecard-mobile-2x.webp');
    await expect(page.locator('.home-teams img')).toHaveAttribute('src', '/marketing/teams-mobile-2x.webp');
    await expect(page.locator('.home-statistics img')).toHaveAttribute('src', '/marketing/statistics-mobile-2x.webp');
    await expect(page.getByText('Shown only after the server confirms the changes.')).toBeVisible();
    await expect(page.locator('.home-hero').getByRole('link', { name: 'Start scoring' })).toHaveAttribute('href', '/app/');
    await expect(page.locator('.home-hero').getByRole('button', { name: 'Install Crease' })).toBeVisible();
    await expect(page.locator('.home-live').getByRole('link', { name: /Explore scoring features/ })).toHaveAttribute('href', '/features/#live-scoring');
    await expect(page.locator('.home-statistics').getByRole('link', { name: /Explore statistics/ })).toHaveAttribute('href', '/features/#statistics');
    await expect(page.locator('.home-journey').getByRole('link', { name: /See how Crease works/ })).toHaveAttribute('href', '/how-it-works/');
    await expect(page.locator('.home-final').getByRole('link', { name: 'Start scoring' })).toHaveAttribute('href', '/app/');
    await expect(page.locator('.home-final').getByRole('button', { name: 'Install Crease' })).toBeVisible();
    for (const image of await page.locator('.home-page img:visible').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate((element) => element.naturalWidth >= element.getBoundingClientRect().width)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('download page uses the real install workflow, platform guides and truthful data-state messaging', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/download/');
    await expect(page.getByRole('heading', { name: 'Bring the scorebook to the ground.' })).toBeVisible();
    await expect(page.locator('.download-phone img').last()).toHaveAttribute('src', '/marketing/scoring-mobile-2x.webp');
    await expect(page.getByRole('heading', { name: 'Use the browser you already have.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Android' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'iPhone & iPad' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Desktop' })).toBeVisible();
    await expect(page.getByText('Pending offline changes are not cloud-backed yet;')).toBeVisible();
    await expect(page.locator('.download-hero').getByRole('link', { name: 'Open Crease' })).toHaveAttribute('href', '/app/');
    await expect(page.locator('.download-hero').getByRole('button', { name: 'Install Crease' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Help Center' })).toHaveAttribute('href', '/help/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('public product pages are reachable, responsive and keep app CTAs working', async ({ page }) => {
  for (const [path, heading] of publicRoutes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('.site-footer')).toBeVisible();
  }

  await page.goto('/');
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const mobileNav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(mobileNav.getByRole('link', { name: 'Features' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mobileNav).not.toHaveClass(/open/);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await mobileNav.getByRole('link', { name: 'Features' }).click();
  await expect(page).toHaveURL(/\/features\/$/);
  await expect(page.getByRole('navigation', { name: 'Feature sections' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scorecards' })).toHaveAttribute('href', '#scorecards');
  await page.screenshot({ path: 'test-results/features-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/features/');
  await page.screenshot({ path: 'test-results/features-desktop.png', fullPage: true });

  await page.goto('/how-it-works/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/how-it-works-desktop.png', fullPage: true });
  const firstFaq = page.locator('.how-faq details').first();
  await expect(firstFaq).toHaveAttribute('open', '');
  await firstFaq.locator('summary').click();
  await expect(firstFaq).not.toHaveAttribute('open', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/how-it-works-mobile.png', fullPage: true });

  await page.goto('/about/');
  await expect(page.getByRole('heading', { name: /Cricket deserves more than a forgotten scorebook/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From the first ball to the final score.' })).toBeVisible();
  await expect(page.getByText('ILLUSTRATIVE SAMPLE')).toBeVisible();
  await expect(page.getByText('Example figures shown for illustration.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Start Scoring/i })).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('link', { name: /Learn how it works/i })).toHaveAttribute('href', '/how-it-works/');
  await expect(page.locator('.about-story .product-preview')).toHaveCount(0);
  const aboutClosingImage = page.locator('.about-closing-image img');
  await aboutClosingImage.scrollIntoViewIfNeeded();
  await expect.poll(() => aboutClosingImage.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => aboutClosingImage.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/about-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => aboutClosingImage.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/about-mobile.png', fullPage: true });
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `About should fit ${viewport.width}px`).toBe(true);
  }
});

test('production image and icon assets load, fit target widths, and preserve the PWA asset set', async ({ page }) => {
  const failedResponses = [];
  page.on('response', (response) => {
    const isAsset = /\.(?:png|webp|avif|svg|ico)(?:$|\?)/i.test(response.url());
    if (isAsset && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (/\.(?:png|webp|avif|svg|ico)(?:$|\?)/i.test(request.url())) {
      failedResponses.push(request.url());
    }
  });

  const iconAssets = [
    ['/icons/crease-app-icon-v2.svg', 512, 'image/svg+xml'],
    ['/icons/crease-app-icon-maskable-v2.svg', 512, 'image/svg+xml'],
    ['/icons/favicon-16-v2.png', 16, 'image/png'],
    ['/icons/favicon-32-v2.png', 32, 'image/png'],
    ['/icons/apple-touch-icon-v2.png', 180, 'image/png'],
    ['/icons/crease-192-v2.png', 192, 'image/png'],
    ['/icons/crease-512-v2.png', 512, 'image/png'],
    ['/icons/crease-maskable-512-v2.png', 512, 'image/png'],
  ];
  for (const [path, size, contentType] of iconAssets) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} should exist in the production build`).toBe(true);
    expect(response.headers()['content-type']).toContain(contentType);
    const metadata = await sharp(await response.body()).metadata();
    expect([metadata.width, metadata.height]).toEqual([size, size]);
  }
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/app', scope: '/', display: 'standalone' });
  expect(manifest.icons.map(({ src }) => src)).toEqual([
    '/icons/crease-192-v2.png',
    '/icons/crease-512-v2.png',
    '/icons/crease-maskable-512-v2.png',
  ]);
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok(), `${icon.src} should load`).toBe(true);
  }
  for (const route of ['/', '/features/', '/about/']) {
    await page.goto(route);
    for (const selector of ['.site-header .site-brand img', '.site-footer .site-brand img']) {
      const logo = page.locator(selector);
      await expect(logo).toHaveAttribute('src', '/icons/crease-app-icon-v2.svg');
      await expect.poll(() => logo.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
  }
  expect(await page.locator('head link[rel="icon"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')))).toEqual([
      '/icons/favicon-32-v2.png',
      '/icons/favicon-16-v2.png',
      '/icons/crease-app-icon-v2.svg',
    ]);
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon-v2.png');

  const imageCases = [
    ['/about/', '.about-editorial-photo', '/about.webp', '/about-mobile.webp', 'about-hero'],
    ['/how-it-works/', '.how-ground', '/howitwork.webp', '/howitwork-mobile.webp', 'how-hero'],
  ];
  const viewports = [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 1024, height: 768, label: 'desktop-1024' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 390, height: 844, label: 'mobile-390' },
    { width: 414, height: 896, label: 'mobile-414' },
    { width: 375, height: 667, label: 'mobile-375' },
    { width: 360, height: 640, label: 'mobile-360' },
    { width: 320, height: 640, label: 'mobile-320' },
    { width: 1920, height: 1080, label: 'desktop-1920' },
  ];

  for (const [route, selector, desktopAsset, mobileAsset, name] of imageCases) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      const hero = page.locator(selector);
      await expect(hero).toBeVisible();
      const image = hero.locator('img');
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
      const before = await hero.boundingBox();
      const expectedAsset = viewport.width <= 900 ? mobileAsset : desktopAsset;
      expect(new URL(await image.evaluate((element) => element.currentSrc)).pathname).toBe(expectedAsset);
      const after = await hero.boundingBox();
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${name}-${viewport.label}.png`, fullPage: true });
    }
  }

  for (const path of [
    '/bg-dashboard-heading.webp',
    '/bg-dashboard-heading-mobile.webp',
    '/ready.webp',
    '/ready-mobile.webp',
  ]) {
    expect((await page.request.get(path)).ok(), `${path} should exist`).toBe(true);
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.home-hero').screenshot({ path: `test-results/home-hero-${viewport.label}.png` });
    const homeCta = page.locator('.home-final');
    await expect(homeCta).toBeVisible();
    await homeCta.locator('img').scrollIntoViewIfNeeded();
    await expect.poll(() => homeCta.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `test-results/home-cta-${viewport.label}.png`, fullPage: true });
  }

  await page.goto('/about/');
  await expect(page.getByRole('link', { name: /Start Scoring/i }).last()).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('link', { name: /Learn how it works/i })).toBeVisible();
  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    const cta = page.locator('.about-closing');
    const readyImage = cta.locator('img');
    await readyImage.scrollIntoViewIfNeeded();
    await expect.poll(() => readyImage.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(new URL(await readyImage.evaluate((element) => element.currentSrc)).pathname).toBe(
      viewport.width <= 720 ? '/ready-mobile.webp' : '/ready.webp',
    );
    const ctaHeading = cta.getByRole('heading', { name: 'Every match has a story. Keep yours.' });
    await expect(ctaHeading).toBeVisible();
    const headingBox = await ctaHeading.boundingBox();
    const imageBox = await readyImage.boundingBox();
    if (viewport.width <= 720) expect(imageBox.y).toBeGreaterThan(headingBox.y);
    else expect(imageBox.x).toBeGreaterThan(headingBox.x);
    await page.screenshot({ path: `test-results/ready-cta-${viewport.label}.png` });
  }

  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Hero image QA');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const welcome = page.locator('.dashboard-welcome');
    await expect(welcome).toBeVisible();
    const background = await welcome.evaluate((element) => getComputedStyle(element).backgroundImage);
    const expectedBackground = viewport.width <= 900
      ? '/bg-dashboard-heading-mobile.webp'
      : '/bg-dashboard-heading.webp';
    expect(background).toContain(expectedBackground);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const heading = await welcome.getByRole('heading', { name: 'Your cricket, at a glance.' }).boundingBox();
    const panel = await welcome.boundingBox();
    expect(heading.x, `Dashboard hero copy should remain inset at ${viewport.width}px`).toBeGreaterThanOrEqual(panel.x + 12);
    expect(heading.x + heading.width).toBeLessThanOrEqual(panel.x + panel.width);
    if (viewport.width >= 1024) {
      const sidebar = await page.locator('.desktop-sidebar').boundingBox();
      expect(heading.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
    }
    const logo = await page.locator('.crease-logo img').first().evaluate((element) => ({ complete: element.complete, width: element.naturalWidth }));
    expect(logo.complete && logo.width > 0, 'shared Crease logo should load in the app header/sidebar').toBe(true);
    const heroContrast = await welcome.evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return { image: style.backgroundImage, opacity: style.opacity, content: style.content };
    });
    expect(heroContrast.image).toContain('linear-gradient');
    expect(heroContrast.opacity).toBe('1');
    expect(heroContrast.content).not.toBe('none');
    await page.screenshot({
      path: `test-results/dashboard-hero-${viewport.label}.png`,
      fullPage: true,
    });
  }
  expect(failedResponses, 'the tested pages should not request missing image/icon assets').toEqual([]);
});
