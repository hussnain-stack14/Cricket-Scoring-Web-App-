import { test, expect } from '@playwright/test';

const signedInSession = {
  authenticated: true,
  teamId: 'CRS-123456',
  workspaceKey: 'CRS-123456',
  teamName: 'Demo Team',
  memberId: 'owner-member',
  role: 'owner',
};

async function mockSignedInAccount(page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signedInSession) }),
  );
  await page.route('**/api/team/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) }),
  );
  await page.route('**/api/sync/push', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applied: [], rejected: [], pushedAt: new Date().toISOString() }),
    }),
  );
  await page.route('**/api/sync/pull**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: [], pulledAt: new Date().toISOString(), hasMore: false }),
    }),
  );
}

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

test('profile sign-out dialog can be cancelled or escaped without leaving a blocking backdrop', async ({
  page,
}) => {
  await mockSignedInAccount(page);
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Your cricket, at a glance.' })).toBeVisible();

  const accountMenu = page
    .locator('.desktop-topbar')
    .getByRole('button', { name: 'Open account and more options' });
  await accountMenu.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.locator('dialog.sheet[open]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(accountMenu).toBeFocused();

  await page.getByRole('link', { name: 'View teams' }).click();
  await expect(page).toHaveURL(/\/app\/teams\/$/);
  await page.goto('/app/');
  await accountMenu.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/account/settings/');
    await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    const mobileDialog = page.locator('dialog.sheet[open]');
    await expect(mobileDialog).toBeVisible();
    const box = await mobileDialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    await mobileDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(mobileDialog).toBeHidden();
  }
});

test('a slow pending sync can be cancelled without losing its local operation or trapping the page', async ({
  page,
}) => {
  await mockSignedInAccount(page);
  await page.route('**/api/sync/push', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Retry later"}' });
  });
  await page.goto('/account/settings/');
  await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();

  const pending = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('crease-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const workspaceId = await new Promise((resolve, reject) => {
      const request = database.transaction('syncMeta').objectStore('syncMeta').getAll();
      request.onsuccess = () => resolve(request.result[0].workspaceId);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['pendingChanges', 'syncMeta'], 'readwrite');
      transaction.objectStore('pendingChanges').put({
        id: `${workspaceId}:teams:pending-team`,
        changeId: 'pending-sign-out-change',
        workspaceId,
        table: 'teams',
        recordId: 'pending-team',
        data: { id: 'pending-team', workspaceId, name: 'Pending team' },
        deleted: false,
        baseRevision: 0,
        queuedAt: new Date().toISOString(),
      });
      const metaStore = transaction.objectStore('syncMeta');
      const getMeta = metaStore.get(workspaceId);
      getMeta.onsuccess = () => metaStore.put({ ...getMeta.result, syncStatus: 'pending' });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    return { workspaceId };
  });

  await page.getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.locator('dialog.sheet[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: /App/ }).click();
  await expect(page).toHaveURL(/\/app\/$/);

  const pendingAfterCancel = await page.evaluate(async ({ workspaceId }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('crease-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const request = database
      .transaction('pendingChanges')
      .objectStore('pendingChanges')
      .get(`${workspaceId}:teams:pending-team`);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(Boolean(request.result));
      request.onerror = () => reject(request.error);
    });
  }, pending);
  expect(pendingAfterCancel).toBe(true);
});

test('confirmed sign-out redirects only after the logout API succeeds', async ({ page }) => {
  await mockSignedInAccount(page);
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );
  await page.goto('/account/settings/');
  await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.locator('dialog.sheet[open]');
  await expect(dialog).toContainText('Are you sure you want to sign out?');
  await dialog.getByRole('button', { name: 'Confirm Sign Out' }).click();
  await expect(page).toHaveURL(/\/account\/login\/$/);
});

test('a logout API failure leaves an actionable dialog and preserves normal navigation', async ({ page }) => {
  await mockSignedInAccount(page);
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign out is temporarily unavailable.' }),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account/settings/');
  await expect(page.getByRole('heading', { name: 'Demo Team' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.locator('dialog.sheet[open]');
  await dialog.getByRole('button', { name: 'Confirm Sign Out' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Sign out is temporarily unavailable.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: /App/ }).click();
  await expect(page).toHaveURL(/\/app\/$/);
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
