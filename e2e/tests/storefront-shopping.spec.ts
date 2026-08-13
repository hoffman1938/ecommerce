import { test, expect } from '@playwright/test';
import { fillCheckout, loginStorefront, registerAndVerify, uniqueEmail } from './helpers';

const PASSWORD = 'E2ePassw0rd!';

test.describe('customer shopping journey', () => {
  test('registration, email verification through Mailpit, and login', async ({ page }) => {
    const email = uniqueEmail('register');
    await registerAndVerify(page, email, PASSWORD);
    await loginStorefront(page, email, PASSWORD);
    await expect(page.getByText('Account overview')).toBeVisible();
  });

  test('product browsing: home, campaigns, catalog, search, detail', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Brand outlet deals/ })).toBeVisible();

    await page.goto('/campaigns');
    await expect(page.getByRole('heading', { name: 'Active campaigns' })).toBeVisible();

    await page.goto('/products');
    await expect(page.getByTestId('product-card').first()).toBeVisible();

    await page.goto('/search?q=aster');
    await expect(page.getByTestId('product-card').first()).toBeVisible();

    await page.goto('/products/aster-essential-cotton-t-shirt');
    await expect(page.getByRole('heading', { name: 'Aster Essential Cotton T-Shirt' })).toBeVisible();
    await expect(page.getByTestId('add-to-cart')).toBeVisible();
  });

  test('final unit: reservation, countdown persistence across reload, and lock-out of a second customer', async ({
    browser,
    page,
  }) => {
    // The seed guarantees the Samba Classic has exactly one unit (size 42).
    await page.goto('/products/aster-sambra-court-sneaker');
    const sizeButton = page.getByTestId('variant-ADI-SMB-SH-BLACK-42');

    // If a previous run left it reserved/sold, skip rather than fail noisily.
    test.skip(await sizeButton.isDisabled(), 'Final unit already taken — run pnpm local:reset');

    await sizeButton.click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('purchase-feedback')).toContainText('reserved');

    await page.goto('/cart');
    const countdown = page.getByTestId('reservation-countdown').first();
    await expect(countdown).toBeVisible();
    const before = await countdown.textContent();

    // Refreshing must NOT reset the timer to 20:00.
    await page.waitForTimeout(3_000);
    await page.reload();
    const after = await page.getByTestId('reservation-countdown').first().textContent();
    expect(after).not.toBe('20:00');
    expect(after! <= before!).toBeTruthy(); // monotonically decreasing

    // A second, separate customer cannot reserve the same final unit.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto('/products/aster-sambra-court-sneaker');
    await expect(otherPage.getByTestId('variant-ADI-SMB-SH-BLACK-42')).toBeDisabled();
    await otherContext.close();

    // Release the unit again so the test suite stays re-runnable.
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });

  test('successful mock payment produces a confirmed order', async ({ page }) => {
    const email = uniqueEmail('buyer');
    await registerAndVerify(page, email, PASSWORD);
    await loginStorefront(page, email, PASSWORD);

    await page.goto('/products/velora-training-shorts');
    await page.getByTestId('variant-PUM-TRN-PT-BLACK-S').click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('purchase-feedback')).toContainText('reserved');

    await page.goto('/cart');
    await page.getByTestId('go-to-checkout').click();

    await fillCheckout(page, email);
    await page.getByTestId('pay-now').click();

    await page.waitForURL(/mock-payment/);
    await page.getByTestId('mock-TEST-SUCCESS').click();

    await page.waitForURL(/checkout\/result/);
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 30_000 });
  });

  test('failed mock payment leaves the order unpaid and the cart intact', async ({ page }) => {
    const email = uniqueEmail('failbuyer');
    await registerAndVerify(page, email, PASSWORD);
    await loginStorefront(page, email, PASSWORD);

    await page.goto('/products/northline-everyday-crew-socks-3-pack');
    await page.getByTestId('variant-NIK-SCK-AC-WHITE-ONESIZE').click();
    await page.getByTestId('add-to-cart').click();
    await page.goto('/cart');
    await page.getByTestId('go-to-checkout').click();
    await fillCheckout(page, email);
    await page.getByTestId('pay-now').click();

    await page.waitForURL(/mock-payment/);
    await page.getByTestId('mock-TEST-FAIL').click();

    await page.waitForURL(/checkout\/result/);
    await expect(page.getByText(/Waiting for payment confirmation/)).toBeVisible();
    await expect(page.getByTestId('order-confirmed')).toHaveCount(0);

    // The reservation returned to the cart for a retry within its window.
    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove' }).first().click();
  });
});
