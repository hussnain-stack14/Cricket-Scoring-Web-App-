import { test, expect } from '@playwright/test';

async function workspace(page) {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Ground scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
}

test('draft resume, schedule, cancellation, deletion and responsive accessible dialogs', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/setup/?new=1');
  await page.getByLabel('Or create Team A').fill('North XI');
  await page.getByRole('button', { name: 'Create team', exact: true }).first().click();
  await page.getByLabel('Or create Team B').fill('South XI');
  await page.getByRole('button', { name: 'Create team', exact: true }).last().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Venue (optional)').fill('City ground');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.goto('/app/');
  await page.getByRole('link', { name: 'Resume setup' }).click();
  await expect(page.getByLabel('Venue (optional)')).toHaveValue('City ground');
  await page.getByLabel('Schedule for later').check();
  await page.getByLabel('Start date and time').fill('2030-12-24T15:30');
  await page.getByRole('button', { name: 'Schedule match' }).click();
  await expect(page.getByRole('heading', { name: 'North XI vs South XI' })).toBeVisible();
  await page.goto('/app/');
  await expect(page.getByRole('link', { name: 'Resume setup' })).toHaveCount(0);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Delete match', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete match?' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    if ([320, 390, 1440].includes(width)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `test-results/scheduled-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.getByRole('link', { name: /Upcoming.*North XI/s }).click();
  await page.getByRole('button', { name: 'Cancel match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await page.goto('/app/matches/');
  await page.getByRole('button', { name: /Cancelled/ }).click();
  await page.getByRole('button', { name: 'Delete match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('button', { name: 'Delete match', exact: true })).toHaveCount(0);
});

test('cached account dashboard renders before background validation and navigation avoids document reloads', async ({
  page,
}) => {
  await workspace(page);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('crease-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['workspaces', 'syncMeta', 'appState'], 'readwrite');
      const request = tx.objectStore('workspaces').getAll();
      request.onsuccess = () => {
        const w = request.result[0];
        tx.objectStore('syncMeta').put({
          workspaceId: w.id,
          teamId: 'perf-account',
          role: 'owner',
          teamName: 'Ground scorer',
          revisions: {},
          conflicts: [],
        });
        tx.objectStore('appState').put({
          id: 'active-workspace',
          workspaceId: w.id,
          teamId: 'perf-account',
        });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  let authCalls = 0;
  let released = false;
  await page.route('**/api/auth/me', async (route) => {
    authCalls++;
    await new Promise((r) => setTimeout(r, 2500));
    released = true;
    await route.fulfill({
      json: {
        authenticated: true,
        teamId: 'PERF',
        workspaceKey: 'perf-account',
        teamName: 'Ground scorer',
        role: 'owner',
      },
    });
  });
  await page.route('**/api/sync/pull?**', (route) =>
    route.fulfill({ json: { records: [], pulledAt: new Date().toISOString() } }),
  );
  const start = Date.now();
  await page.reload();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
  const elapsed = Date.now() - start;
  console.log(
    `Cached dashboard visible in ${elapsed}ms (${process.env.CREASE_TEST_DEV ? 'development' : 'production'})`,
  );
  expect(released).toBe(false);
  await expect.poll(() => released).toBe(true);
  expect(authCalls).toBe(1);
  await page.evaluate(() => (window.__navigationMarker = 'preserved'));
  await page.getByRole('link', { name: 'Matches', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__navigationMarker)).toBe('preserved');
  await page.getByRole('link', { name: 'Crease dashboard' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(
    page.locator('.sidebar-nav').getByRole('link', { name: 'Dashboard', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.locator('.sidebar-nav').getByRole('link', { name: 'Home', exact: true }),
  ).toHaveCount(0);
});

test('login lock shows remaining duration and disables retries', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 429,
      json: { error: 'Sign in temporarily unavailable.', retryAfter: 600 },
    }),
  );
  await page.goto('/account/login/');
  await page.getByLabel('Team ID', { exact: true }).fill('LOCK-TEAM');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.auth-error')).toContainText('Try again in 10:00');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
});
