import type { PrismaClient } from '@prisma/client';

export const SETTING_KEYS = {
  reservationDurationMinutes: 'reservation_duration_minutes',
  lowStockThreshold: 'low_stock_threshold',
  standardShippingMinor: 'standard_shipping_minor',
  expressShippingMinor: 'express_shipping_minor',
  freeShippingThresholdMinor: 'free_shipping_threshold_minor',
  taxRateBps: 'tax_rate_bps',
} as const;

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  const defaults: Record<string, unknown> = {
    [SETTING_KEYS.reservationDurationMinutes]: 20,
    [SETTING_KEYS.lowStockThreshold]: 5,
    [SETTING_KEYS.standardShippingMinor]: 495,
    [SETTING_KEYS.expressShippingMinor]: 995,
    [SETTING_KEYS.freeShippingThresholdMinor]: 10000,
    // Prices are VAT-inclusive; this rate is used to display the included tax.
    [SETTING_KEYS.taxRateBps]: 2000,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: {}, // keep admin-modified values on re-seed
    });
  }
  console.log('Seeded site settings');
}

const CONTENT_PAGES: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'privacy_policy',
    title: 'Privacy Policy',
    body: 'This is placeholder privacy policy content for the local development environment. Replace it with your real policy before any production launch.\n\nWe store account details (name, email), order history, and addresses to fulfil orders. Local development data never leaves your machine.',
  },
  {
    key: 'terms',
    title: 'Terms and Conditions',
    body: 'Placeholder terms and conditions for the local development environment.\n\n1. Orders are only confirmed after successful payment.\n2. Reserved items are held for a limited time (20 minutes by default).\n3. Returns are accepted within 30 days of delivery.',
  },
  {
    key: 'cookie_policy',
    title: 'Cookie Policy',
    body: 'This shop uses strictly necessary cookies only: a session cookie for signed-in customers and a cart cookie that keeps your cart between visits. No tracking or marketing cookies are set in the local development build.',
  },
  {
    key: 'faq',
    title: 'Frequently Asked Questions',
    body: 'Q: How long are items reserved in my cart?\nA: 20 minutes by default. The countdown is shown in the cart.\n\nQ: When do campaigns end?\nA: Each campaign shows its end time on the campaign page.\n\nQ: How do returns work?\nA: Request a return from your order page after delivery; refunds are issued after the returned items are inspected.',
  },
  {
    key: 'shipping_info',
    title: 'Shipping Information',
    body: 'Standard shipping: 3-5 business days (4.95).\nExpress shipping: 1-2 business days (9.95).\nOrders over 100.00 ship free with standard shipping.\n\nLocal development note: no real shipments are created.',
  },
  {
    key: 'returns_info',
    title: 'Returns',
    body: 'You can request a return for delivered items within 30 days. Once your return is approved and received, refunds are issued to the original payment method within 5-10 business days.',
  },
  {
    key: 'contact_info',
    title: 'Contact',
    body: 'Outlet Marketplace (local development)\nEmail: support@outlet.local\nAll emails in local development are captured by Mailpit at http://localhost:8025.',
  },
];

export async function seedContent(prisma: PrismaClient): Promise<void> {
  for (const page of CONTENT_PAGES) {
    await prisma.contentPage.upsert({
      where: { key: page.key },
      create: page,
      update: {}, // keep admin edits on re-seed
    });
  }
  console.log('Seeded content pages');
}
