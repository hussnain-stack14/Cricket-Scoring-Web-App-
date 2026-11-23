import { test, expect } from '@playwright/test';

async function workspace(page) {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Sync scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
}

test('account menu toggles, closes outside and closes with Escape at mobile and desktop widths', async ({
  page,
}) => {
  await workspace(page);
  for (const width of [320, 430, 1024]) {
    await page.setViewportSize({ width, height: 820 });
    const header = page.locator(
      width < 768
        ? '.mobile-header-actions'
        : '.desktop-topbar',
    );
    const menu = header.getByRole('button', { name: 'Open account and more options' });
    await menu.click();
    const panel = page.locator('.header-more-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    await menu.click();
    await expect(panel).toHaveCount(0);
    await menu.click();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).first().click();
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('offline and installation settings remain readable and contained across viewport sizes', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/more/');
  await page.getByRole('button', { name: /Cloud sync & offline/ }).click();
  for (const width of [320, 360, 390, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 860 });
    for (const theme of ['green', 'red-ball', 'blue']) {
      await page.evaluate((nextTheme) => {
        if (nextTheme === 'green') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', nextTheme);
      }, theme);
      const card = page.getByRole('heading', { name: 'Offline & installation' }).locator('..');
      await expect(card).toBeVisible();
      await expect(card.getByRole('status')).toBeVisible();
      for (const name of ['Retry Preparation', 'Check for Updates', 'Install Crease']) {
        await expect(card.getByRole('button', { name, exact: true })).toBeVisible();
      }
      const bounds = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
      expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 860 });
  await page.screenshot({ path: 'test-results/offline-settings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/offline-settings-desktop.png', fullPage: true });
});

test('statistics shows compact offline-ready Top 20 controls without desktop overflow', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/statistics/');
  await expect(page.getByRole('tab', { name: 'Batters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top Batters' })).toBeVisible();
  await expect(page.getByText('Batting Performance', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Team')).toHaveValue('');
  await expect(page.getByLabel('Team').locator('option:checked')).toHaveText('All Teams');
  await expect(page.getByLabel('Match format').locator('option:checked')).toHaveText('All Formats');
  await expect(page.getByLabel('Time period').locator('option:checked')).toHaveText('All Time');
  await expect(page.getByText('0 players')).toBeVisible();
  await page.getByRole('tab', { name: 'Bowlers' }).click();
  await expect(page.getByLabel('Ranking')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top Bowlers' })).toBeVisible();
  await expect(page.getByText('Bowling Performance', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'All-Rounders' }).click();
  await page.getByText('How rankings work').click();
  await expect(
    page.getByText(/Performance rating combines the existing batting and bowling ratings/i),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/rankings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rankings-desktop.png', fullPage: true });
});
