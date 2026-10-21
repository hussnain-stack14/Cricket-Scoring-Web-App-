import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('fresh workspace, complete offline match, persistence, profile, backups and mobile layouts', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  await expect(page.getByText('A workspace of your own')).toBeVisible();
  await page.getByLabel('Your scorer name').fill('Local scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('No matches in progress.', { exact: false })).toBeVisible();
  // Teams and Players have never been visited in this context before disconnecting.
  await context.setOffline(true);
  await page.goto('/players/');
  for (const name of ['Amber', 'Birch', 'Cedar', 'Dawn']) {
    await page.getByRole('button', { name: 'Add player', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    if (name === 'Amber') {
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === 'players') {
            IDBObjectStore.prototype.put = original;
            throw new DOMException('Simulated storage full', 'QuotaExceededError');
          }
          return original.apply(this, args);
        };
      });
      await page.getByRole('button', { name: 'Save player', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Simulated storage full');
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Amber');
    }
    await page.getByRole('button', { name: 'Save player', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const profile = await page.getByRole('link', { name: 'Amber', exact: true }).getAttribute('href');
  await page.goto(profile);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Amber' })).toBeVisible();
  await page.goto('/teams/');
  for (const [name, players] of [
    ['North', ['Amber', 'Birch']],
    ['South', ['Cedar', 'Dawn']],
  ]) {
    await page.getByRole('button', { name: 'Add team', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    for (const p of players) await page.getByRole('checkbox', { name: new RegExp(p) }).check();
    await page.getByRole('button', { name: 'Save team' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.goto('/setup/');
  await page.getByLabel('Team A', { exact: true }).selectOption({ label: 'North' });
  await page.getByLabel('Team B', { exact: true }).selectOption({ label: 'South' });
  for (const p of ['Amber', 'Birch', 'Cedar', 'Dawn'])
    await page.getByRole('checkbox', { name: new RegExp(p) }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Overs per innings').fill('1');
  await page.getByLabel('Players per side').fill('2');
  await page.getByLabel('Maximum overs per bowler').fill('1');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Players per side')).toHaveValue('2');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Toss winner')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Opening striker', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Opening non-striker', { exact: true }).selectOption({ index: 2 });
  await page.getByLabel('Opening bowler', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Create match' }).click();
  await expect(page).toHaveURL(/match/);
  const matchUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Record delivery' })).toBeVisible();
  await page.getByRole('button', { name: '4', exact: true }).dblclick();
  await expect(page.locator('.big-score')).toContainText('4/0');
  await page.waitForTimeout(500);
  // A stale second tab must be rejected rather than silently overwrite play.
  const tab2 = await context.newPage();
  await tab2.goto(matchUrl);
  await expect(tab2.locator('.big-score')).toContainText('4/0');
  await page.getByRole('button', { name: '0', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('(0.2)');
  await tab2.getByRole('button', { name: '1', exact: true }).click();
  await expect(tab2.getByRole('alert')).toContainText('another tab');
  await tab2.close();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '0', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Set up the chase' }).click();
  await page.getByLabel('Opening striker', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Opening non-striker', { exact: true }).selectOption({ index: 2 });
  await page.getByLabel('Opening bowler', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Start second innings' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm finalization' }).click();
  await expect(page.getByText('Finalized. Included in player career statistics.')).toBeVisible();
  await page.goto('/more/');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  await page.getByLabel('Import backup', { exact: true }).setInputFiles(backupPath);
  await expect(page.getByRole('dialog')).toContainText('1 matches');
  await page.getByRole('button', { name: 'Confirm replacement' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByLabel('Import backup', { exact: true })
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"app":"bad"}'),
    });
  await expect(page.getByRole('alert')).toContainText('invalid backup');
  await page.goto(matchUrl);
  await expect(page.getByText('Finalized. Included in player career statistics.')).toBeVisible();
  for (const width of [320, 390, 430, 1200]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/match-${width}.png`, fullPage: true });
  }
  // Install a new asset-cache version, prove it waits, then apply it without losing records.
  await context.setOffline(false);
  await page.goto('/more/');
  const originalWorker = await readFile('out/sw.js', 'utf8');
  try {
    await writeFile(
      'out/sw.js',
      originalWorker.replace(/const CACHE = '([^']+)'/, "const CACHE = '$1-update-test'"),
    );
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await expect(page.getByRole('button', { name: 'Apply update & reload' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Apply update & reload' }).click();
    await expect(
      page.getByText('Ready offline. Every core screen is stored on this device.'),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await writeFile('out/sw.js', originalWorker);
  }
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(matchUrl);
  await expect(
    reopened.getByText('Finalized. Included in player career statistics.'),
  ).toBeVisible();
  await context.setOffline(false);
  const isolated = await browser.newContext();
  const fresh = await isolated.newPage();
  await fresh.goto('/');
  await expect(fresh.getByText('A workspace of your own')).toBeVisible();
  await isolated.close();
});
