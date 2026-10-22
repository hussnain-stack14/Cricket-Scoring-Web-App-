import { test, expect } from '@playwright/test';

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
      body: JSON.stringify({ ok: true, teamId: 'CRS-YOUNGS01' }),
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
  await teamDialog.getByRole('textbox', { name: 'New Team ID' }).fill('CRS-YOUNGS01');
  await teamDialog
    .getByRole('textbox', { name: 'Current Password', exact: true })
    .fill('CurrentPass123');
  await teamDialog.getByRole('button', { name: 'Continue' }).click();
  await expect(teamDialog.getByRole('heading', { name: 'Confirm your new Team ID' })).toBeVisible();
  await teamDialog.getByRole('button', { name: 'Confirm and save' }).click();

  await expect(security.getByText('CRS-YOUNGS01')).toBeVisible();
  await expect(security.getByRole('status')).toContainText('Team ID updated');
  expect(teamIdRequest).toEqual({
    newTeamId: 'CRS-YOUNGS01',
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
