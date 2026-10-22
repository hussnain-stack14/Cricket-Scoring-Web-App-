import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('fresh workspace, complete offline match, persistence, profile, backups and mobile layouts', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Every Ball. Every Run. Every Moment.' }),
  ).toBeVisible();
  await expect(page.locator('.offline-setup-status').last()).toContainText(
    'Ready for Offline Use',
    {
      timeout: 45000,
    },
  );
  await page.getByRole('link', { name: 'Open web app' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByText('A workspace of your own')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Your scorer name').fill('Local scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('No matches in progress.', { exact: false })).toBeVisible();
  // Teams and Players have never been visited in this context before disconnecting.
  await context.setOffline(true);
  await page.goto('/app/players/');
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
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
        'Simulated storage full',
      );
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Amber');
    }
    await page.getByRole('button', { name: 'Save player', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Reserve');
  await page.getByRole('button', { name: 'Save player', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Reserve' }).click();
  await page.getByRole('button', { name: 'Delete player' }).click();
  await page.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(page.getByRole('link', { name: 'Reserve', exact: true })).toHaveCount(0);
  const profile = await page.getByRole('link', { name: 'Amber', exact: true }).getAttribute('href');
  await page.goto(profile);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Amber' })).toBeVisible();
  await page.goto('/app/teams/');
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
  await page.getByRole('button', { name: 'Add team', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Practice');
  await page.getByRole('button', { name: 'Save team' }).click();
  await page.getByRole('button', { name: 'Edit Practice' }).click();
  await page.getByRole('button', { name: 'Delete team' }).click();
  await page.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(page.getByText('Practice', { exact: true })).toHaveCount(0);
  await page.goto('/app/setup/');
  await page.getByRole('combobox', { name: 'Team A' }).selectOption({ label: 'North' });
  await page.getByRole('combobox', { name: 'Team B' }).selectOption({ label: 'South' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Overs per innings').fill('2');
  await page.getByLabel('Players per side').fill('3');
  await page.getByLabel('Maximum overs per bowler').fill('1');
  await page.getByRole('combobox', { name: 'Toss winner' }).selectOption('0');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Players per side')).toHaveValue('3');
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page).toHaveURL(/match/);
  const matchUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Who is batting? Select striker' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add new batsman' }).click();
  await page.getByLabel('Player name').fill('Quick Striker');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByRole('button', { name: '+ Add new batsman' }).click();
  await page.getByLabel('Player name').fill('Quick Partner');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByRole('button', { name: '+ Add new bowler' }).click();
  await page.getByLabel('Player name').fill('Opening Bowler');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tap to score' })).toBeVisible();
  await page.getByRole('button', { name: 'Advanced delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Advanced delivery' })).toBeVisible();
  await expect(page.getByLabel('Completed runs by running (for ends)')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('4/0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('0/0');
  await page.getByRole('button', { name: 'Wide', exact: true }).click();
  let deliveryDialog = page.getByRole('dialog');
  await deliveryDialog.getByRole('button', { name: 'Wide', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: '1', exact: true }).click();
  await expect(deliveryDialog.getByText('Team total for this ball:')).toContainText('2');
  await deliveryDialog.getByRole('button', { name: 'Record Ball' }).click();
  await expect(page.locator('.big-score')).toContainText('2/0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('0/0');
  await page.getByRole('button', { name: 'No-ball', exact: true }).click();
  deliveryDialog = page.getByRole('dialog');
  await deliveryDialog.getByRole('button', { name: 'No Ball', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: '1', exact: true }).click();
  await expect(deliveryDialog.getByText('Team total for this ball:')).toContainText('2');
  await deliveryDialog.getByRole('button', { name: 'Record Ball' }).click();
  await expect(page.locator('.big-score')).toContainText('2/0');
  await expect(page.getByText('FREE HIT', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'W', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run out', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bowled', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('0/0');
  await expect(page.getByText('FREE HIT', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bye', exact: true }).click();
  deliveryDialog = page.getByRole('dialog');
  await deliveryDialog.getByRole('button', { name: 'Bye', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: '2', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: 'Record Ball' }).click();
  await expect(page.locator('.big-score')).toContainText('2/0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('0/0');
  await page.getByRole('button', { name: 'Leg Bye', exact: true }).click();
  deliveryDialog = page.getByRole('dialog');
  await deliveryDialog.getByRole('button', { name: 'Leg Bye', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: '3', exact: true }).click();
  await deliveryDialog.getByRole('button', { name: 'Record Ball' }).click();
  await expect(page.locator('.big-score')).toContainText('3/0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('0/0');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('1/0');
  // A stale second tab must be rejected rather than silently overwrite play.
  const tab2 = await context.newPage();
  await tab2.goto(matchUrl);
  await expect(tab2.locator('.big-score')).toContainText('1/0');
  await page.getByRole('button', { name: '0', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('(0.2)');
  await tab2.getByRole('button', { name: '1', exact: true }).click();
  await expect(tab2.locator('.notice.error')).toContainText('another tab');
  await tab2.close();
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '0', exact: true }).click();
  }
  await page.getByRole('button', { name: 'W', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Record wicket' })).toBeVisible();
  await page.getByRole('button', { name: 'Record wicket' }).click();
  await page.getByRole('button', { name: '+ Add new batsman' }).click();
  await page.getByLabel('Player name').fill('Replacement Batter');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByRole('button', { name: '+ Add new bowler' }).click();
  await page.getByLabel('Player name').fill('Second Bowler');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  for (let ball = 0; ball < 6; ball++) {
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '0', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Set up the chase' }).click();
  await page.getByRole('button', { name: 'Start second innings' }).click();
  await page.getByRole('combobox', { name: 'Select striker' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm player' }).click();
  await page.getByRole('combobox', { name: 'Select non-striker' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm player' }).click();
  await page.getByRole('combobox', { name: 'Select opening bowler' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm player' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize match', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm finalization' }).click();
  await expect(page.getByText('Finalized. Included in player career statistics.')).toBeVisible();
  await page.goto('/app/more/');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  await page.getByLabel('Import backup', { exact: true }).setInputFiles(backupPath);
  await expect(page.getByRole('dialog')).toContainText('1 matches');
  await page.getByRole('button', { name: 'Confirm replacement' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Import backup', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"bad"}'),
  });
  await expect(page.locator('.notice.error')).toContainText('invalid backup');
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
  await page.goto('/app/more/');
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
    await expect(page.getByText('Ready for Offline Use', { exact: true })).toBeVisible({
      timeout: 30000,
    });
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
  await expect(
    fresh.getByRole('heading', { name: 'Every Ball. Every Run. Every Moment.' }),
  ).toBeVisible();
  await fresh.getByRole('link', { name: 'Open web app' }).click();
  await expect(fresh).toHaveURL(/\/app\/$/);
  await expect(fresh.getByText('A workspace of your own')).toBeVisible();
  await isolated.close();
});
