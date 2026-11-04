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
