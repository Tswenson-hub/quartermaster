import { expect, test } from '@playwright/test';

// M1 smoke: load tutorial level 1, accept every proposal for 7 days, no stockout.
// Selectors are data-testid hooks the UI agent provides:
//   start-scenario-tutorial-1, proposal-row, proposal-accept, end-day, campaign-day, morale, kpi-service-level

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('app loads', async ({ page }) => {
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('tutorial 1: accept proposals for 7 days with no stockout', async ({ page }) => {
  await page.getByTestId('start-scenario-tutorial-1').click();
  // The game opens on Dispatch; proposals live on their own screen.
  await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: /Order Proposals/ }).click();
  for (let day = 0; day < 7; day++) {
    // Day N of the player's command (1 on the takeover morning), independent of the warm-up length.
    await expect(page.getByTestId('campaign-day')).toHaveText(String(day + 1));
    const accepts = page.getByTestId('proposal-accept');
    for (let i = 0; i < (await accepts.count()); i++) await accepts.nth(i).click();
    await page.getByTestId('end-day').click();
  }
  await expect(page.getByTestId('kpi-service-level')).toContainText('100');
});
