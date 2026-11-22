import { expect, test } from '@playwright/test';

test('the application shell stays mounted while navigating workspace routes', async ({ page }) => {
  await page.goto('/app/');
  const collapseButton = page.getByRole('button', { name: 'Collapse navigation' });
  await expect(collapseButton).toBeVisible();
  await collapseButton.click();

  await page.getByRole('link', { name: 'Teams', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/teams\/?$/);
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
});
