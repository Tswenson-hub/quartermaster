import { expect, test } from '@playwright/test';

// Master Data: item-location rows, click-through to Item Planning, vendor order-day override.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('item-locations: count matches rows, row opens Item Planning', async ({ page }) => {
  await page.getByTestId('start-scenario-tutorial-1').click();
  await page.getByTestId('nav-masterdata').click();

  const rows = page.getByTestId('master-item-row');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId('master-item-count')).toContainText(`${n} active`);

  await rows.first().click();
  await expect(page.getByTestId('nav-planning')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('planning-d2')).toBeVisible();
});

test('vendors: ordering every day moves D2 and MOP; orders show up in performance', async ({ page }) => {
  // tutorial-2, not tutorial-1: tutorial-1's apothecary already orders Mon–Sat, so on day 0 "Every day"
  // leaves D2 unchanged. tutorial-2's abbey orders Mon/Thu with a 3-day lead time, so D2 moves from 6 to 4.
  await page.getByTestId('start-scenario-tutorial-2').click();
  await page.getByTestId('nav-planning').click();
  const d2Before = await page.getByTestId('planning-d2').textContent();
  const mopBefore = await page.getByTestId('planning-mop').textContent();

  await page.getByTestId('nav-masterdata').click();
  await page.getByTestId('master-tab-vendors').click();
  const vendorRows = page.getByTestId('master-vendor-row');
  await expect(vendorRows.first()).toBeVisible();
  const select = page.locator('select[data-testid^="order-days-"]').first();
  const vendorId = (await select.getAttribute('data-testid'))!.replace('order-days-', '');
  await select.selectOption('daily');
  await expect(page.getByTestId(`order-days-text-${vendorId}`)).toContainText('Every day');

  await page.getByTestId('nav-planning').click();
  const d2After = await page.getByTestId('planning-d2').textContent();
  const mopAfter = await page.getByTestId('planning-mop').textContent();
  expect(d2After).not.toBe(d2Before);
  expect(mopAfter).not.toBe(mopBefore);

  // Order every day for three days, then the vendor's performance row counts the orders.
  await page.getByTestId('nav-proposals').click();
  for (let day = 0; day < 3; day++) {
    const accepts = page.getByTestId('proposal-accept');
    for (let i = 0; i < (await accepts.count()); i++) await accepts.nth(i).click();
    await page.getByTestId('end-day').click();
  }
  await page.getByTestId('nav-masterdata').click();
  await page.getByTestId('master-tab-vendors').click();
  await expect(page.getByTestId(`vendor-orders-${vendorId}`)).not.toHaveText('0');
});
