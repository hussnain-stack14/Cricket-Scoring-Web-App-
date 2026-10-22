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
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

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

  const resources = await page.evaluate(async () => {
    const manifestResponse = await fetch('/manifest.webmanifest');
    const manifest = await manifestResponse.json();
    const icons = await Promise.all(
      manifest.icons.map(async (icon) => {
        const response = await fetch(icon.src);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        return {
          status: response.status,
          type: response.headers.get('content-type'),
          width: bitmap.width,
          height: bitmap.height,
        };
      }),
    );
    const startPage = await fetch(manifest.start_url);
    const worker = await fetch('/sw.js');
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
  ]);
  expect(resources.workerStatus).toBe(200);
  expect(resources.workerType).toContain('javascript');
  expect(resources.verification.ready).toBe(true);
  expect(resources.verification.missing).toBe(0);

  await page.getByRole('button', { name: 'Download app' }).first().click();
  await expect(page.getByText('Install on desktop')).toBeVisible();
  await expect(
    page.getByText('Installation instructions available', { exact: true }),
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
  await expect(page.locator('.offline-setup-status').last()).toContainText('Install Crease');
  await page.getByRole('button', { name: 'Install Crease' }).click();
  await expect.poll(() => page.evaluate(() => window.__creasePromptCalled)).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('.offline-setup-status').last()).toContainText('App Already Installed');
  await page.getByRole('link', { name: 'Open Crease' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  expect(consoleErrors).toEqual([]);
});
