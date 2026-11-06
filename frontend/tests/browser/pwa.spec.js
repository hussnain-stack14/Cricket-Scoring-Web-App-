import { test, expect } from '@playwright/test';

test('production install controls, manifest, icons and offline precache are accurate', async ({
  page,
}) => {
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() === 404) consoleErrors.push(`404 ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)'))
      consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every Ball. Every Moment.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install Crease' }).first()).toBeVisible();

  const resources = await page.evaluate(async () => {
    const manifestResponse = await fetch('/manifest.webmanifest');
    const manifest = await manifestResponse.json();
    const icons = await Promise.all(
      manifest.icons.map(async (icon) => {
        const response = await fetch(icon.src);
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.src = imageUrl;
        await image.decode();
        URL.revokeObjectURL(imageUrl);
        return {
          status: response.status,
          type: response.headers.get('content-type'),
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );
    const startPage = await fetch(manifest.start_url);
    const worker = await fetch('/sw.js');
    const release = await fetch('/release.json', { cache: 'no-store' });
    const releaseMetadata = await release.json();
    const registration = await navigator.serviceWorker.ready;
    const verification = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(
        () => reject(new Error('Service worker verification timed out')),
        10000,
      );
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
        channel.port1.close();
      };
      registration.active.postMessage({ type: 'VERIFY' }, [channel.port2]);
    });
    return {
      manifestStatus: manifestResponse.status,
      manifest,
      startPageStatus: startPage.status,
      icons,
      workerStatus: worker.status,
      workerType: worker.headers.get('content-type'),
      releaseStatus: release.status,
      releaseMetadata,
      verification,
    };
  });

  expect(resources.manifestStatus).toBe(200);
  expect(resources.manifest.name).toBe('Crease – Cricket Scoring');
  expect(resources.manifest.short_name).toBe('Crease');
  expect(resources.manifest.start_url).toBe('/app');
  expect(resources.startPageStatus).toBe(200);
  expect(resources.manifest.scope).toBe('/');
  expect(resources.manifest.display).toBe('standalone');
  expect(resources.icons).toEqual([
    { status: 200, type: 'image/png', width: 192, height: 192 },
    { status: 200, type: 'image/png', width: 512, height: 512 },
    { status: 200, type: 'image/png', width: 512, height: 512 },
  ]);
  expect(resources.workerStatus).toBe(200);
  expect(resources.workerType).toContain('javascript');
  expect(resources.releaseStatus).toBe(200);
  expect(resources.releaseMetadata.version).toMatch(/^[a-f0-9]{16}$/);
  expect(resources.verification.ready).toBe(true);
  expect(resources.verification.missing).toBe(0);

  await page.getByRole('button', { name: 'Install Crease' }).first().click();
  await expect(
    page.getByText('Use your browser address-bar install icon or its Install app menu item.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Install Crease' }).click();

  const promptPreserved = await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = () => {
      window.__creasePromptCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(promptPreserved).toBe(true);
  await expect(page.getByRole('button', { name: 'Install Crease' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Install Crease' }).first().click();
  await expect.poll(() => page.evaluate(() => window.__creasePromptCalled)).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('link', { name: 'Open Crease' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Crease' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  expect(consoleErrors).toEqual([]);
});

test('dashboard install suggestion is dismissible for the browser session and never blocks scoring', async ({
  page,
}) => {
  await page.goto('/app/');
  await page.getByLabel('Your scorer name').fill('Install banner scorer');
  await page.getByRole('button', { name: 'Get started' }).click();

  const desktopLogo = page.locator('.desktop-sidebar .crease-logo');
  await expect(desktopLogo).toBeVisible();
  await expect(desktopLogo.locator('img')).toHaveAttribute('src', '/icons/crease-app-icon-v2.svg');
  await expect(desktopLogo).toContainText('crease.');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/branding-dashboard-desktop.png' });

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.locator('.desktop-sidebar .crease-logo > img')).toBeVisible();
  await expect(page.locator('.desktop-sidebar .crease-logo-word')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLogo = page.locator('.brand .crease-logo');
  await expect(mobileLogo).toBeVisible();
  await expect(mobileLogo).toContainText('crease.');
  await page.screenshot({ path: 'test-results/branding-dashboard-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });

  const banner = page.locator('.install-banner');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Dismiss install suggestion' }).click();
  await expect(banner).toBeHidden();

  await page.reload();
  await expect(banner).toBeHidden();
  await page.getByRole('link', { name: 'View total matches' }).click();
  await expect(page).toHaveURL(/\/app\/matches\/$/);

  await page.goto('/app/');
  await page.getByRole('link', { name: 'View teams' }).click();
  await expect(page).toHaveURL(/\/app\/teams\/$/);

  await page.getByRole('link', { name: 'Matches', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
});

test('credential change APIs reject cross-origin and unauthenticated requests', async ({
  page,
  request,
}) => {
  await page.goto('/account/login/');
  for (const path of ['/api/account/team-id', '/api/account/password']) {
    const crossOrigin = await request.patch(path, {
      headers: { Origin: 'https://attacker.invalid' },
      data: {},
    });
    expect(crossOrigin.status()).toBe(403);

    const unauthenticated = await page.evaluate(async (url) => {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return { status: response.status, body: await response.json() };
    }, path);
    expect(unauthenticated.status, JSON.stringify(unauthenticated.body)).toBe(401);
  }
});

test('login uses the same approved full Crease logo', async ({ page }) => {
  await page.goto('/account/login/');
  const logo = page.locator('.auth-brand .crease-logo');
  await expect(logo).toBeVisible();
  await expect(logo.locator('img')).toHaveAttribute('src', '/icons/crease-app-icon-v2.svg');
  await expect(logo).toContainText('crease.');
  await page.screenshot({ path: 'test-results/branding-login.png', fullPage: true });
});
