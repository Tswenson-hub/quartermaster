import { expect, test } from '@playwright/test';

// M2 smoke: difficulty + market label, forecast override, KPI panel, letters inbox.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('tutorial 1 on hard: market, forecast override, KPIs, letters', async ({ page }) => {
  await page.getByTestId('difficulty-hard').click();
  await page.getByTestId('start-scenario-tutorial-1').click();

  // Hard difficulty follows a volatile ticker.
  await expect(page.getByTestId('market')).toContainText('TSLA');
  await expect(page.getByTestId('rank')).toBeVisible();

  // One-day forecast override from Item Planning.
  await page.getByTestId('nav-planning').click();
  const cell = page.getByTestId('forecast-cell').nth(2);
  await cell.fill('42');
  await cell.press('Enter');
  await expect(page.locator('.user-fc-flag')).toBeVisible();
  await expect(page.locator('.fc-cell.overridden')).toHaveCount(1);
  await expect(page.getByTestId('forecast-cell').nth(2)).toHaveValue('42');

  for (let day = 0; day < 3; day++) await page.getByTestId('end-day').click();
  await expect(page.getByTestId('today')).toHaveText('3');

  await page.getByTestId('nav-dispatch').click();
  const kpis = page.getByTestId('kpi-panel');
  await expect(kpis).toBeVisible();
  for (const label of ['Service level', 'Days of supply', 'Spoilage', 'SWAPE', 'Bias']) {
    await expect(kpis).toContainText(label);
  }

  await page.getByTestId('nav-letters').click();
  await expect(page.getByTestId('letters-inbox')).toBeVisible();
});
