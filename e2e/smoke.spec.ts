import { expect, test } from '@playwright/test';

// M1 smoke: load tutorial level 1, accept every proposal for 7 days, no stockout.
// Selectors are data-testid hooks the UI agent provides:
//   start-scenario-tutorial-1, nav-proposals, proposal-row, proposal-accept, end-day, today, morale, kpi-service-level

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
  await page.getByTestId('nav-proposals').click();
  for (let day = 0; day < 7; day++) {
    await expect(page.getByTestId('today')).toContainText(String(day));
    const accepts = page.getByTestId('proposal-accept');
    for (let i = 0; i < (await accepts.count()); i++) await accepts.nth(i).click();
    await page.getByTestId('end-day').click();
  }
  await expect(page.getByTestId('kpi-service-level')).toContainText('100');
});
