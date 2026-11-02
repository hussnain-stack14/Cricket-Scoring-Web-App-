import { test, expect } from '@playwright/test';

async function workspace(page) {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Sync scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
}

test('profile popover toggles, closes outside and closes with Escape at mobile and desktop widths', async ({
  page,
}) => {
  await workspace(page);
  for (const width of [320, 430, 1024]) {
    await page.setViewportSize({ width, height: 820 });
    const menu = page.locator(
      width < 768
        ? '.mobile-header-actions .account-popover summary'
        : '.desktop-topbar .account-popover summary',
    );
    await menu.click();
    await expect(page.locator('.account-popover[open]')).toBeVisible();
    await menu.click();
    await expect(page.locator('.account-popover[open]')).toHaveCount(0);
    await menu.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.account-popover[open]')).toHaveCount(0);
    await menu.click();
    await page.getByRole('heading', { name: 'Your cricket, at a glance.' }).click();
    await expect(page.locator('.account-popover[open]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('statistics shows compact offline-ready Top 20 controls without desktop overflow', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/statistics/');
  await expect(page.getByRole('tab', { name: 'Batters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top 20 Batters' })).toBeVisible();
  await page.getByRole('tab', { name: 'Bowlers' }).click();
  await expect(page.getByLabel('Ranking')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'All-Rounders' }).click();
  await expect(page.getByText(/All-rounder rating = batting rating/i)).toBeVisible();
  await page.screenshot({ path: 'test-results/rankings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopLayout = await page.evaluate(() => ({
    scrollX: window.scrollX,
    contentLeft: document.querySelector('.app-content')?.getBoundingClientRect().left,
    workspaceLeft: document.querySelector('.app-workspace')?.getBoundingClientRect().left,
    workspaceWidth: document.querySelector('.app-workspace')?.getBoundingClientRect().width,
    workspaceMargin: getComputedStyle(document.querySelector('.app-workspace')).marginLeft,
  }));
  console.log(desktopLayout);
  expect(desktopLayout.scrollX).toBe(0);
  expect(desktopLayout.contentLeft).toBeGreaterThanOrEqual(252);
  await page.screenshot({ path: 'test-results/rankings-desktop.png', fullPage: true });
});
