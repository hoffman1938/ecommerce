import { loadConfig } from '@outlet/config';
import { InMemoryQueueClient } from '@outlet/queue';
import { MockPaymentProvider } from '@outlet/payments';
import { PrismaService } from '../src/common/prisma.service';
import { SettingsService } from '../src/common/settings.service';
import { AuditService } from '../src/common/audit.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { CartService } from '../src/modules/cart/cart.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { AdminInventoryService } from '../src/modules/admin/admin-inventory.service';

/**
 * Builds the real service graph against the test database — no HTTP layer,
 * but identical business logic and SQL to production.
 */
export interface TestContext {
  prisma: PrismaService;
  queue: InMemoryQueueClient;
  settings: SettingsService;
  reservations: ReservationsService;
  carts: CartService;
  orders: OrdersService;
  checkout: CheckoutService;
  payments: PaymentsService;
  inventory: AdminInventoryService;
  mockProvider: MockPaymentProvider;
  close(): Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const config = loadConfig();
  const prisma = new PrismaService();
  await prisma.$connect();

  const queue = new InMemoryQueueClient();
  const settings = new SettingsService(prisma);
  const audit = new AuditService(prisma);
  const reservations = new ReservationsService(prisma, settings, audit, queue);
  const carts = new CartService(prisma, settings, reservations);
  const orders = new OrdersService(prisma, audit, queue);
  const mockProvider = new MockPaymentProvider({
    webhookSecret: config.payments.mockWebhookSecret,
    paymentPageBaseUrl: config.urls.storefront,
  });
  const checkout = new CheckoutService(
    prisma,
    carts,
    reservations,
    orders,
    settings,
    config,
    mockProvider,
  );
  const payments = new PaymentsService(prisma, reservations, audit, config, mockProvider, queue);
  const inventory = new AdminInventoryService(prisma, audit, reservations);

  return {
    prisma,
    queue,
    settings,
    reservations,
    carts,
    orders,
    checkout,
    payments,
    inventory,
    mockProvider,
    close: async () => {
      await prisma.$disconnect();
    },
  };
}

/** Truncate every table between tests (order-independent via CASCADE). */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations')",
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface CatalogFixture {
  brandId: string;
  productId: string;
  variantId: string;
  sku: string;
}

/** Minimal sellable product with the given stock. */
export async function seedVariant(
  prisma: PrismaService,
  options: { stock: number; priceMinor?: number; sku?: string } = { stock: 1 },
): Promise<CatalogFixture> {
  const sku = options.sku ?? `TEST-SKU-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const brand = await prisma.brand.upsert({
    where: { slug: 'test-brand' },
    create: { name: 'Test Brand', slug: 'test-brand' },
    update: {},
  });
  const product = await prisma.product.create({
    data: {
      name: `Test Product ${sku}`,
      slug: `test-product-${sku.toLowerCase()}`,
      brandId: brand.id,
      originalPriceMinor: options.priceMinor != null ? options.priceMinor * 2 : 4000,
      outletPriceMinor: options.priceMinor ?? 2000,
      status: 'ACTIVE',
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      size: 'M',
      color: 'Black',
      inventory: { create: { onHandQuantity: options.stock } },
    },
  });
  return { brandId: brand.id, productId: product.id, variantId: variant.id, sku };
}

export async function createCart(
  prisma: PrismaService,
  token = `tok_${Math.random().toString(36).slice(2)}`,
) {
  return prisma.cart.create({ data: { anonymousToken: token } });
}

export async function getBalance(prisma: PrismaService, variantId: string) {
  return prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } });
}
