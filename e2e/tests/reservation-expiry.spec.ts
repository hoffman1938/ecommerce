import { test, expect } from '@playwright/test';
import { ADMIN_URL, loginAdmin } from './helpers';

/**
 * Reservation expiration end-to-end. To keep the test under two minutes, the
 * admin temporarily lowers the configurable reservation duration to 1 minute
 * (spec: duration is an admin setting), waits for the worker/lazy check to
 * release the hold, then restores 20 minutes.
 */
test.describe('reservation expiration', () => {
  test('an expired reservation frees the unit and empties the cart line', async ({ page }) => {
    test.slow();

    // 1. Lower the reservation duration to 1 minute.
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/content`);
    const durationField = page.getByTestId('setting-reservationDurationMinutes');
    await durationField.fill('1');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    try {
      // 2. Reserve an item as a fresh anonymous shopper.
      const shopper = await page.context().browser()!.newContext();
      const shopperPage = await shopper.newPage();
      await shopperPage.goto('/products/velora-training-shorts');
      await shopperPage.getByTestId('variant-PUM-TRN-PT-GREEN-XL').click();
      await shopperPage.getByTestId('add-to-cart').click();
      await expect(shopperPage.getByTestId('purchase-feedback')).toContainText('reserved');

      await shopperPage.goto('/cart');
      await expect(shopperPage.getByTestId('reservation-countdown')).toBeVisible();

      // 3. Wait past the 1-minute window (+ sweep interval headroom).
      await shopperPage.waitForTimeout(95_000);
      await shopperPage.reload();

      // 4. The server expired the hold: the line is gone and the shopper is told.
      await expect(
        shopperPage
          .getByText(/expired and (was|were) removed/)
          .or(shopperPage.getByText('Your cart is empty')),
      ).toBeVisible({ timeout: 20_000 });
      await shopper.close();
    } finally {
      // 5. Restore the default duration for subsequent tests.
      await page.goto(`${ADMIN_URL}/content`);
      await page.getByTestId('setting-reservationDurationMinutes').fill('20');
      await page.getByRole('button', { name: 'Save settings' }).click();
      await expect(page.getByText('Settings saved')).toBeVisible();
    }
  });
});
