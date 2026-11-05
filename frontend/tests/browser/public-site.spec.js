import { test, expect } from '@playwright/test';

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

  const iconPaths = [
    '/icons/crease-app-icon.svg',
    '/icons/crease-app-icon-maskable.svg',
    '/icons/favicon-16.png',
    '/icons/favicon-32.png',
    '/icons/apple-touch-icon.png',
  ];
  for (const path of iconPaths) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} should exist in the production build`).toBe(true);
  }
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok(), `${icon.src} should load`).toBe(true);
  }

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
    await page.locator('.site-hero').screenshot({ path: `test-results/home-hero-${viewport.label}.png` });
    const homeCta = page.locator('.final-cta');
    await expect(homeCta).toBeVisible();
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
