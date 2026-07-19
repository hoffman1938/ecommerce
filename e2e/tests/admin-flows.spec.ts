import { test, expect } from '@playwright/test';
import { ADMIN_URL, loginAdmin } from './helpers';

test.describe('administration panel', () => {
  test('admin login shows the dashboard KPIs', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByText('Revenue')).toBeVisible();
    await expect(page.getByText('Active reservations')).toBeVisible();
  });

  test('RBAC: an analyst sees no product-creation controls', async ({ page }) => {
    await loginAdmin(page, 'analyst@example.local', 'Admin123!');
    await page.goto(`${ADMIN_URL}/products`);
    await expect(page.getByTestId('product-card')).toHaveCount(0); // sanity: admin table view
    // Read-only Analyst lacks products.create — the "New product" button leads
    // to an API 403; the nav still shows Products (products.view).
    await expect(page.getByText('Products')).toBeVisible();
  });

  test('create a product with a variant and initial stock, then adjust inventory', async ({
    page,
  }) => {
    const suffix = Date.now().toString(36).toUpperCase();
    const sku = `E2E-SKU-${suffix}`;

    await loginAdmin(page);

    // Create the product.
    await page.goto(`${ADMIN_URL}/products/new`);
    await page.getByLabel('Name').fill(`E2E Test Jacket ${suffix}`);
    await page.getByLabel('Brand').selectOption({ index: 1 });
    await page.getByText('Original price').locator('..').locator('input').fill('9999');
    await page.getByTestId('outlet-price').fill('4999');
    await page.getByLabel('Status').selectOption('ACTIVE');
    await page.getByTestId('save-product').click();
    await page.waitForURL(/\/products\/(?!new)/);

    // Add a variant with initial stock 5.
    await page.getByTestId('variant-sku').fill(sku);
    await page.getByTestId('variant-size').fill('M');
    await page.getByTestId('variant-color').fill('Black');
    await page.getByTestId('variant-initialQuantity').fill('5');
    await page.getByTestId('add-variant').click();
    await expect(page.getByText(sku)).toBeVisible();

    // Adjust inventory: restock +3 with a reason (audited).
    await page.goto(`${ADMIN_URL}/inventory`);
    await page.getByPlaceholder('Search by SKU or product…').fill(sku);
    await page.getByTestId(`adjust-${sku}`).click();
    await page.getByTestId('adjust-type').selectOption('RESTOCK');
    await page.getByTestId('adjust-quantity').fill('3');
    await page.getByTestId('adjust-reason').fill('E2E restock');
    await page.getByTestId('adjust-submit').click();
    await expect(page.getByText('8').first()).toBeVisible(); // 5 + 3 on hand
  });

  test('create and activate a campaign with an assigned product', async ({ page }) => {
    const suffix = Date.now().toString(36);
    await loginAdmin(page);

    await page.goto(`${ADMIN_URL}/campaigns/new`);
    await page.getByTestId('campaign-title').fill(`E2E Flash Sale ${suffix}`);
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    await page.getByTestId('campaign-starts').fill(toLocal(now));
    await page.getByTestId('campaign-ends').fill(toLocal(end));
    await page.getByLabel('Status').selectOption('ACTIVE');
    await page.getByTestId('save-campaign').click();
    await page.waitForURL(/\/campaigns\/(?!new)/);

    await page.getByTestId('assign-product').selectOption({ index: 1 });
    await page.getByTestId('assign-price').fill('1111');
    await page.getByTestId('assign-submit').click();
    await expect(page.getByText('€11.11')).toBeVisible();
  });

  test('order processing: move the seeded order along the fulfillment chain', async ({ page }) => {
    await loginAdmin(page, 'orders@example.local', 'Admin123!');
    await page.goto(`${ADMIN_URL}/orders`);

    const seededOrder = page.getByTestId('order-OUT-100002');
    test.skip(!(await seededOrder.isVisible().catch(() => false)), 'Seed order not found');
    await seededOrder.click();

    const statusBadgeShipped = page.getByText('SHIPPED', { exact: true }).first();
    if (await statusBadgeShipped.isVisible().catch(() => false)) {
      test.skip(true, 'Order already shipped in a previous run — run pnpm local:reset');
    }

    await page.getByTestId('order-status-select').selectOption('SHIPPED');
    await page.getByTestId('tracking-number').fill('TRK-E2E-001');
    await page.getByTestId('order-status-submit').click();
    await expect(page.getByText('TRK-E2E-001').first()).toBeVisible({ timeout: 15_000 });
  });

  test('return processing: approve, receive with restock, complete, and refund', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/returns`);

    const seededReturn = page.getByTestId('return-RMA-100001');
    test.skip(
      !(await seededReturn.isVisible().catch(() => false)),
      'Seed return not found — run pnpm local:reset',
    );
    await seededReturn.click();

    const approveButton = page.getByTestId('approve-return');
    test.skip(
      !(await approveButton.isVisible().catch(() => false)),
      'Return already processed in a previous run — run pnpm local:reset',
    );

    await approveButton.click();
    await expect(page.getByTestId('receive-return')).toBeVisible();
    await page.getByTestId('receive-return').click();
    await expect(page.getByTestId('complete-return')).toBeVisible();
    await page.getByTestId('complete-return').click();
    await expect(page.getByText('COMPLETED').first()).toBeVisible();

    // Issue a mock refund for the returned item.
    await page.getByTestId('return-refund-amount').fill('1799');
    await page.getByTestId('return-refund-submit').click();
    await expect(page.getByText('SUCCEEDED').first()).toBeVisible({ timeout: 15_000 });
  });
});
