import { test, expect } from '@playwright/test';

async function newWorkspace(page) {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Toss scorer');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
}

test('scheduled toss restores offline, starts only explicitly, and scoring stays responsive at every breakpoint', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newWorkspace(page);
  await expect(page.locator('.brand .offline-readiness-label')).toHaveText('Ready offline', {
    timeout: 45000,
  });
  await page.goto('/app/setup/?new=1');
  await page.getByLabel('Or create Team A').fill('North Rangers');
  await page.getByRole('button', { name: 'Create team', exact: true }).first().click();
  await page.getByLabel('Or create Team B').fill('South Strikers');
  await page.getByRole('button', { name: 'Create team', exact: true }).last().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Schedule for later').check();
  await expect(page.getByLabel('Toss winner')).toHaveCount(0);
  await page.getByLabel('Start date and time').fill('2030-12-24T15:30');
  await page.getByRole('button', { name: 'Schedule match' }).click();
  await expect(page.getByRole('heading', { name: 'Who won the toss?' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'South Strikers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What did they choose?' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('South Strikers won the toss.')).toBeVisible();
  await page.getByRole('button', { name: 'Bowl first', exact: true }).click();
  for (const [name, team] of [
    ['A very long opening batter name', 'North Rangers'],
    ['Second opener', 'North Rangers'],
    ['Opening pacer', 'South Strikers'],
  ]) {
    await page.getByRole('button', { name: 'Add player', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').selectOption({ label: team });
    await dialog.getByLabel('Player name').fill(name);
    await dialog.getByRole('button', { name: 'Add player', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page
    .getByRole('combobox', { name: 'Opening striker', exact: true })
    .selectOption({ label: 'A very long opening batter name' });
  await expect(page.locator('.prematch-setup')).toHaveAttribute('aria-busy', 'false');
  await page
    .getByRole('combobox', { name: 'Opening non-striker', exact: true })
    .selectOption({ label: 'Second opener' });
  await expect(page.locator('.prematch-setup')).toHaveAttribute('aria-busy', 'false');
  await page
    .getByRole('combobox', { name: 'Opening bowler', exact: true })
    .selectOption({ label: 'Opening pacer' });
  await page.getByRole('button', { name: 'Review match' }).click();
  await expect(page.getByRole('button', { name: 'Start Scoring' })).toBeDisabled();
  await page.getByLabel('Allow early start for this match').check();
  await expect(page.getByRole('button', { name: 'Start Scoring' })).toBeEnabled();
  await page.getByLabel('Allow early start for this match').uncheck();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ready for the first ball' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2031-01-01T00:00:00Z'));
  await expect(page.getByRole('button', { name: 'Start Scoring' })).toBeEnabled();
  await expect(page.locator('.match-centre-header .match-status')).toHaveText('Scheduled');
  await page.getByRole('button', { name: 'Start Scoring' }).dblclick();
  await expect(page.getByRole('tab', { name: 'Score', exact: true })).toBeVisible();
  await expect(page.locator('.score-panel h2')).toHaveText('North Rangers');
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('4');
  await expect(page.locator('.delivery-feedback')).not.toBeEmpty();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await expect(page.locator('.big-score')).toContainText('9');
  await page.reload();
  await expect(page.locator('.big-score')).toContainText('9');
  await expect(page.getByRole('heading', { name: 'Who won the toss?' })).toHaveCount(0);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const table = await page.locator('.live-player-tables').boundingBox();
    expect(table.x + table.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible();
    await page.getByLabel('More actions', { exact: true }).click();
    const menu = await page.locator('.match-menu-panel').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await page.screenshot({
      path: `test-results/match-centre-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  const scoreTab = page.getByRole('tab', { name: 'Score', exact: true });
  await scoreTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Scorecard', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  await scoreTab.click();
  await page
    .getByRole('button', { name: /Inspect delivery/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scoreTab.click();
  expect(
    await page.locator('.big-score').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('content-shaped skeleton appears on slow local open and is removed without delaying cached content', async ({
  page,
}) => {
  await newWorkspace(page);
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args);
      if (sessionStorage.getItem('slow-open-done')) return request;
      return new Proxy(request, {
        set(target, key, value) {
          if (key === 'onsuccess')
            target[key] = (event) =>
              setTimeout(() => {
                sessionStorage.setItem('slow-open-done', '1');
                value.call(target, event);
              }, 900);
          else target[key] = value;
          return true;
        },
        get(target, key) {
          const v = Reflect.get(target, key, target);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    };
    window.skeletonShown = false;
    new MutationObserver(() => {
      if (document.querySelector('.screen-skeleton')) window.skeletonShown = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  const skeleton = page.getByRole('status', { name: 'Loading dashboard' });
  await expect(skeleton).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.skeleton')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
  await expect(skeleton).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Your scorebook starts here')).toBeVisible();
  expect(await page.evaluate(() => window.skeletonShown)).toBe(false);
});

test('player profile and team management confirm archives, restore offline and delete only unused records', async ({
  page,
  context,
}) => {
  await newWorkspace(page);
  await expect(page.locator('.brand .offline-readiness-label')).toHaveText('Ready offline', {
    timeout: 45000,
  });
  await context.setOffline(true);
  await page.goto('/app/players/');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Reserve');
  await page.getByRole('button', { name: 'Save player', exact: true }).click();
  await page.getByRole('link', { name: 'Reserve', exact: true }).click();
  await page.getByText('Manage player', { exact: true }).click();
  await page.getByRole('button', { name: 'Archive player', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Historical matches and statistics are preserved',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Archive player', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await page.goto('/app/players/');
  await expect(page.getByRole('link', { name: 'Reserve', exact: true })).toHaveCount(0);
  await page.getByLabel('Show archived players').check();
  await page.getByRole('button', { name: 'Edit Reserve', exact: true }).click();
  await page.getByRole('button', { name: 'Restore player', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click();
  await page.goto('/app/teams/');
  await page.getByRole('button', { name: 'Add team', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Reserve XI');
  await page.getByRole('checkbox', { name: /Reserve/ }).check();
  await page.getByRole('button', { name: 'Save team', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Reserve XI', exact: true }).click();
  await page.getByRole('button', { name: 'Archive team', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await page.reload();
  await page.getByLabel('Show archived teams').check();
  await page.getByRole('button', { name: 'Edit Reserve XI', exact: true }).click();
  await page.getByRole('button', { name: 'Delete team', exact: true }).click();
  await page.getByRole('button', { name: 'Permanently delete', exact: true }).click();
  await page.goto('/app/players/');
  await expect(page.getByRole('link', { name: 'Reserve', exact: true })).toBeVisible();
});

test('player search resets between opening selections and scoring remains disabled until the lineup is ready', async ({
  page,
}) => {
  await newWorkspace(page);
  await page.goto('/app/players/');
  for (let i = 1; i <= 8; i++) {
    await page.getByRole('button', { name: 'Add player', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Batter ' + i);
    await page.getByRole('button', { name: 'Save player', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.goto('/app/teams/');
  for (const team of ['Home', 'Away']) {
    await page.getByRole('button', { name: 'Add team', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(team);
    if (team === 'Home')
      for (let i = 1; i <= 8; i++)
        await page.getByRole('checkbox', { name: 'Batter ' + i, exact: true }).check();
    await page.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.goto('/app/setup/?new=1');
  await page.getByRole('combobox', { name: 'Team A', exact: true }).selectOption({ label: 'Home' });
  await page.getByRole('combobox', { name: 'Team B', exact: true }).selectOption({ label: 'Away' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('button', { name: '4', exact: true })).toBeDisabled();
  await page.getByLabel('Find player').fill('Batter 1');
  await page
    .getByRole('combobox', { name: 'Select striker', exact: true })
    .selectOption({ label: 'Batter 1' });
  await page.getByRole('button', { name: 'Confirm Striker', exact: true }).click();
  await expect(page.getByLabel('Find player')).toHaveValue('');
  await page
    .getByRole('combobox', { name: 'Select non-striker', exact: true })
    .selectOption({ label: 'Batter 2' });
  await page.getByRole('button', { name: 'Confirm Non-striker', exact: true }).click();
  await page.getByRole('button', { name: '+ Add new bowler' }).click();
  await page.getByLabel('Player name').fill('Opening bowler');
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(page.getByRole('button', { name: '4', exact: true })).toBeEnabled();
});
