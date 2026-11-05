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
  await expect(page.getByRole('link', { name: 'Start Scoring' }).first()).toHaveAttribute('href', '/app/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/about-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/about-mobile.png', fullPage: true });
});

test('approved hero images load at desktop and mobile sizes without shifting or covering content', async ({
  page,
}) => {
  const imageCases = [
    ['/about/', '/about.png', '.about-ground', 'about'],
    ['/how-it-works/', '/howitwork.png', '.how-ground', 'how-it-works'],
  ];

  for (const [route, imagePath, selector, name] of imageCases) {
    const asset = await page.request.get(imagePath);
    expect(asset.ok(), `${imagePath} should load`).toBe(true);

    for (const viewport of [
      { width: 1440, height: 900, label: 'desktop' },
      { width: 390, height: 844, label: 'mobile' },
    ]) {
      await page.setViewportSize(viewport);
      const imageResponse = page.waitForResponse((response) => response.url().endsWith(imagePath));
      await page.goto(route);
      const hero = page.locator(selector);
      await expect(hero).toBeVisible();
      await imageResponse;
      const before = await hero.boundingBox();
      const background = await hero.evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(background).toContain(imagePath);
      await page.waitForTimeout(100);
      const after = await hero.boundingBox();
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${name}-hero-${viewport.label}.png`, fullPage: true });
    }
  }

  await page.request.get('/bg-dashboard-heading.png').then((response) => {
    expect(response.ok(), 'dashboard background should load').toBe(true);
  });
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Hero image QA');
  await page.getByRole('button', { name: 'Get started' }).click();
  for (const viewport of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    await page.setViewportSize(viewport);
    const welcome = page.locator('.dashboard-welcome');
    await expect(welcome).toBeVisible();
    const background = await welcome.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toContain('/bg-dashboard-heading.png');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const heading = await welcome.getByRole('heading', { name: 'Your cricket, at a glance.' }).boundingBox();
    const panel = await welcome.boundingBox();
    expect(heading.x).toBeGreaterThanOrEqual(panel.x);
    expect(heading.x + heading.width).toBeLessThanOrEqual(panel.x + panel.width);
    if (viewport.width >= 1024) {
      const sidebar = await page.locator('.desktop-sidebar').boundingBox();
      expect(heading.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
    }
    await page.screenshot({
      path: `test-results/dashboard-hero-${viewport.label}.png`,
      fullPage: true,
    });
  }
});
