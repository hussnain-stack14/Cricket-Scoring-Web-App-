import { test, expect } from '@playwright/test';

test('session endpoint reports an absent session as unauthorized, not a server failure', async ({
  request,
}) => {
  const response = await request.get('/api/auth/me/');
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ authenticated: false });
});

test('login UI distinguishes successful login, bad credentials, lockout, and service failure', async ({
  browser,
}) => {
  const scenarios = [
    {
      password: 'ValidPass123',
      status: 200,
      body: { teamId: 'CRS-123456', teamName: 'Demo Team', memberId: 'owner', role: 'owner' },
      expected: 'redirect',
    },
    {
      password: 'WrongPass123',
      status: 401,
      body: { error: 'Team ID or password is incorrect.' },
      expected: 'Team ID or password is incorrect.',
    },
    {
      password: 'LockedPass123',
      status: 429,
      body: { error: 'Sign in temporarily unavailable.', retryAfter: 600 },
      expected: 'Sign in temporarily unavailable.',
    },
    {
      password: 'UnavailablePass123',
      status: 503,
      body: { error: 'MongoDB is not configured.' },
      expected: 'MongoDB is not configured.',
    },
  ];

  for (const scenario of scenarios) {
    const page = await browser.newPage();
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: scenario.status,
        contentType: 'application/json',
        body: JSON.stringify(scenario.body),
      }),
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false }),
      }),
    );
    await page.goto('/account/login/');
    await page.getByLabel('Team ID').fill('CRS-123456');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(scenario.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    if (scenario.expected === 'redirect') {
      await expect(page).toHaveURL(/\/app\/?$/);
    } else {
      await expect(page.locator('.auth-error[role="alert"]')).toContainText(scenario.expected);
    }
    await page.close();
  }
});

test('sync diagnostics export is read-only and does not start synchronization', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        teamId: 'CRS-123456',
        workspaceKey: 'CRS-123456',
        teamName: 'Demo Team',
        memberId: 'owner-member',
        role: 'owner',
      }),
    }),
  );
  await page.route('**/api/team/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ members: [] }),
    }),
  );
  let syncRequests = 0;
  await page.route('**/api/sync/**', async (route) => {
    syncRequests++;
    await route.fulfill({ status: 500, body: 'Unexpected sync request' });
  });

  await page.goto('/account/settings/');
  await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export read-only sync diagnostics' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('crease-sync-diagnostics.json');
  expect(syncRequests).toBe(0);
});

test('account owners can update login credentials in responsive security dialogs', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        teamId: 'CRS-123456',
        workspaceKey: 'CRS-123456',
        teamName: 'Demo Team',
        memberId: 'owner-member',
        role: 'owner',
      }),
    }),
  );
  await page.route('**/api/team/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ members: [] }),
    }),
  );

  let teamIdRequest;
  await page.route('**/api/account/team-id', async (route) => {
    teamIdRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, teamId: 'ROYAL-CLUB' }),
    });
  });

  let passwordRequest;
  await page.route('**/api/account/password', async (route) => {
    passwordRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/settings/');
  await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();
  const security = page.locator('#security');
  await expect(security.getByText('Current Team ID')).toBeVisible();
  await expect(security.getByText('CRS-123456')).toBeVisible();

  await security.getByRole('button', { name: 'Edit Team ID' }).click();
  const teamDialog = page.getByRole('dialog');
  await teamDialog.getByRole('textbox', { name: 'New Team ID' }).fill('royal-club');
  await teamDialog
    .getByRole('textbox', { name: 'Current Password', exact: true })
    .fill('CurrentPass123');
  await teamDialog.getByRole('button', { name: 'Continue' }).click();
  await expect(teamDialog.getByRole('heading', { name: 'Confirm your new Team ID' })).toBeVisible();
  await teamDialog.getByRole('button', { name: 'Confirm and save' }).click();

  await expect(security.getByText('ROYAL-CLUB')).toBeVisible();
  await expect(security.getByRole('status')).toContainText('Team ID updated');
  expect(teamIdRequest).toEqual({
    newTeamId: 'ROYAL-CLUB',
    currentPassword: 'CurrentPass123',
  });

  await security.getByRole('button', { name: 'Change Password' }).click();
  const passwordDialog = page.getByRole('dialog', { name: 'Change Password' });
  await passwordDialog
    .getByRole('textbox', { name: 'Current Password', exact: true })
    .fill('CurrentPass123');
  await passwordDialog
    .getByRole('textbox', { name: 'New Password', exact: true })
    .fill('NewPass456');
  await passwordDialog
    .getByRole('textbox', { name: 'Confirm New Password', exact: true })
    .fill('NewPass456');
  await passwordDialog.getByRole('button', { name: 'Show current password' }).click();
  await expect(
    passwordDialog.getByRole('textbox', { name: 'Current Password', exact: true }),
  ).toHaveAttribute('type', 'text');
  await passwordDialog.getByRole('button', { name: 'Save new password' }).click();

  await expect(security.getByRole('status')).toContainText('Other signed-in devices');
  expect(passwordRequest).toEqual({
    currentPassword: 'CurrentPass123',
    newPassword: 'NewPass456',
    confirmPassword: 'NewPass456',
  });
});
