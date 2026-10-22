import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('fresh workspace, complete offline match, persistence, profile, backups and mobile layouts', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every Ball. Every Moment.' })).toBeVisible();
  await expect(page.locator('.offline-setup-status').last()).toContainText(
    'Ready to use offline.',
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
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
  await page.goto('/app/matches/');
  await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
  await expect(page.getByText('No matches here yet')).toBeVisible();
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
        'Could not save your changes. Check available storage and try again.',
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
  await expect(page.getByLabel('Runs taken')).toBeVisible();
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
  const scorecardDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Scorecard' }).click();
  const scorecardDownload = await scorecardDownloadPromise;
  expect(scorecardDownload.suggestedFilename()).toMatch(/^Crease_North_vs_South_.*\.pdf$/);

  const resultReportPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Result PDF' }).click();
  const resultReport = await resultReportPromise;
  await expect(resultReport.getByRole('heading', { name: 'Match result', level: 1 })).toBeVisible();
  await expect(resultReport.locator('body')).toContainText('North vs South');
  await resultReport.close();

  await page.goto('/app/matches/');
  await page.getByRole('button', { name: /Completed/ }).click();
  const completedMatchCard = page.locator('.match-grid > .match-card-item');
  await expect(completedMatchCard).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  const completedCardWidth = await completedMatchCard.evaluate(
    (card) => card.getBoundingClientRect().width,
  );
  expect(completedCardWidth).toBeLessThan(768);
  const historyPdfPromise = page.waitForEvent('download');
  await completedMatchCard.getByRole('button', { name: 'Download Scorecard' }).click();
  expect((await historyPdfPromise).suggestedFilename()).toMatch(/^Crease_North_vs_South_.*\.pdf$/);

  await page.goto('/app/teams/');
  const northTeamRow = page.locator('.person-row').filter({ hasText: 'North' });
  await northTeamRow.getByRole('button', { name: 'Statistics' }).click();
  await expect(page.getByRole('heading', { name: 'North statistics' })).toBeVisible();
  await expect(page.getByText('Matches played')).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Batting', exact: true }).click();
  const battingDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const battingDownload = await battingDownloadPromise;
  const battingCsv = await readFile(await battingDownload.path(), 'utf8');
  expect(battingCsv).toContain('"Rank","Player","Matches"');
  expect(battingCsv).toContain('Quick Striker');
  for (const width of [320, 390, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Bowling', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Legal balls' })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const comparisonPopupPromise = page.waitForEvent('popup');
  const comparisonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export comparison' }).click();
  const [comparisonReport] = await Promise.all([comparisonPopupPromise, comparisonDownloadPromise]);
  await expect(
    comparisonReport.getByRole('heading', { name: 'North · Player comparison' }),
  ).toBeVisible();
  await comparisonReport.close();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const teamReportPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Report PDF' }).click();
  const teamReport = await teamReportPromise;
  await expect(teamReport.getByRole('heading', { name: 'North · Team statistics' })).toBeVisible();
  await teamReport.close();

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
  await expect(page.locator('.notice.error')).toContainText('valid Crease backup');
  await page.goto(matchUrl);
  await expect(page.getByText('Finalized. Included in player career statistics.')).toBeVisible();
  for (const width of [320, 390, 430, 1200]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width >= 1024) {
      const columns = await page.evaluate(() => {
        const details = document.querySelector('.live-score-details').getBoundingClientRect();
        const actions = document.querySelector('.live-score-actions').getBoundingClientRect();
        return actions.left > details.left && actions.width > 0;
      });
      expect(columns).toBe(true);
    }
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
    await expect(page.getByText('Ready to use offline.', { exact: true })).toBeVisible({
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
  await expect(fresh.getByRole('heading', { name: 'Every Ball. Every Moment.' })).toBeVisible();
  await fresh.getByRole('link', { name: 'Open web app' }).click();
  await expect(fresh).toHaveURL(/\/app\/$/);
  await expect(fresh.getByText('A workspace of your own')).toBeVisible();
  await isolated.close();
});

test('dashboard shell and navigation stay usable across phone, tablet, and desktop widths', async ({
  page,
}) => {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Responsive scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();

  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Your cricket, at a glance.' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `unexpected horizontal overflow at ${width}px`).toBe(false);
    if (width < 1024) {
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(page.locator('.desktop-sidebar')).toBeHidden();
    } else {
      await expect(page.locator('.desktop-sidebar')).toBeVisible();
      await expect(page.locator('.bottom-nav')).toBeHidden();
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Matches', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/matches\/$/);
  await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Teams' }).click();
  await page.getByRole('button', { name: 'Add team', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Responsive XI');
  await page.getByRole('button', { name: 'Save team' }).click();
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page).toHaveURL(/\/app\/statistics\/$/);
  await expect(page.getByLabel('Team')).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/app\/reports\/$/);
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
});

test('match setup actions remain within the form and visible at responsive widths', async ({
  page,
}) => {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Setup tester');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.goto('/app/setup/');

  for (const team of ['North', 'South']) {
    await page.getByLabel(`Or create Team ${team === 'North' ? 'A' : 'B'}`).fill(team);
    await page
      .getByRole('button', { name: 'Create team', exact: true })
      .nth(team === 'North' ? 0 : 1)
      .click();
  }

  const actions = page.locator('.setup-actions');
  const card = page.locator('.setup-card');
  await expect(card.getByRole('heading', { name: 'Choose teams' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Continue' })).toBeVisible();

  for (const width of [360, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await actions.scrollIntoViewIfNeeded();
    await expect(actions.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Continue' })).toBeVisible();
    const layout = await page.evaluate(() => {
      const container = document.querySelector('.setup-layout').getBoundingClientRect();
      const form = document.querySelector('.setup-card').getBoundingClientRect();
      const action = document.querySelector('.setup-actions').getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      const navVisible = getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none';
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        layoutWidth: container.width,
        formWidth: form.width,
        actionBottom: action.bottom,
        cardBottom: form.bottom,
        navTop: nav.top,
        navVisible,
        actionPosition: getComputedStyle(document.querySelector('.setup-actions')).position,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.actionBottom).toBeLessThanOrEqual(layout.cardBottom + 1);
    expect(layout.actionPosition).not.toBe('sticky');
    if (width >= 1440) expect(layout.formWidth).toBeLessThan(1000);
    if (layout.navVisible) expect(layout.actionBottom).toBeLessThanOrEqual(layout.navTop);
  }

  await page.getByRole('button', { name: 'Save draft' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved on this device');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(card.getByRole('heading', { name: 'Match rules & toss' })).toBeVisible();
  await expect(page.getByLabel('Toss winner')).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Back' })).toBeVisible();

  for (const width of [360, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await actions.scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Match date')).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Start match' })).toBeVisible();
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.setup-card').getBoundingClientRect();
      const action = document.querySelector('.setup-actions').getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        actionBottom: action.bottom,
        cardBottom: form.bottom,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.actionBottom).toBeLessThanOrEqual(layout.cardBottom + 1);
  }
});
