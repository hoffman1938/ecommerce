import type { PrismaClient, ProductVariant, Product, Brand } from '@prisma/client';

const TAX_RATE_BPS = 2000; // prices are VAT-inclusive; used for included-tax display

/** Included VAT portion of a gross amount. */
function includedTax(grossMinor: number): number {
  return Math.round((grossMinor * TAX_RATE_BPS) / (10000 + TAX_RATE_BPS));
}

type VariantWithProduct = ProductVariant & { product: Product & { brand: Brand } };

async function findVariant(
  prisma: PrismaClient,
  skuPrefix: string,
): Promise<VariantWithProduct | null> {
  return prisma.productVariant.findFirst({
    where: { sku: { startsWith: skuPrefix } },
    include: { product: { include: { brand: true } } },
  }) as Promise<VariantWithProduct | null>;
}

function snapshotOf(variant: VariantWithProduct) {
  return {
    productId: variant.productId,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    brandName: variant.product.brand.name,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    imageUrl: null,
  };
}

interface SeedOrderItem {
  variant: VariantWithProduct;
  quantity: number;
}

async function createSeedOrder(
  prisma: PrismaClient,
  opts: {
    orderNumber: string;
    userEmail: string;
    items: SeedOrderItem[];
    status: 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
    daysAgo: number;
  },
): Promise<string | null> {
  const existing = await prisma.order.findUnique({ where: { orderNumber: opts.orderNumber } });
  if (existing) return existing.id;

  const user = await prisma.user.findUnique({ where: { email: opts.userEmail } });
  if (!user) return null;

  const placedAt = new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000);
  const subtotal = opts.items.reduce(
    (sum, item) =>
      sum +
      (item.variant.priceOverrideMinor ?? item.variant.product.outletPriceMinor) * item.quantity,
    0,
  );
  const shipping = subtotal >= 10000 ? 0 : 495;
  const total = subtotal + shipping;
  const tax = includedTax(total);

  const address = {
    firstName: user.firstName,
    lastName: user.lastName,
    line1: 'Example Street 12',
    line2: null,
    city: 'Berlin',
    region: null,
    postalCode: '10115',
    countryCode: 'DE',
    phone: '+49 30 0000000',
  };

  const order = await prisma.order.create({
    data: {
      orderNumber: opts.orderNumber,
      userId: user.id,
      email: user.email,
      status: opts.status,
      subtotalMinor: subtotal,
      shippingMinor: shipping,
      taxMinor: tax,
      totalMinor: total,
      shippingAddress: address,
      billingAddress: address,
      shippingMethod: 'STANDARD',
      placedAt,
      paidAt: placedAt,
      items: {
        create: opts.items.map((item) => {
          const unit = item.variant.priceOverrideMinor ?? item.variant.product.outletPriceMinor;
          const lineTotal = unit * item.quantity;
          return {
            variantId: item.variant.id,
            productSnapshot: snapshotOf(item.variant),
            sku: item.variant.sku,
            name: item.variant.product.name,
            quantity: item.quantity,
            unitPriceMinor: unit,
            originalUnitPriceMinor: item.variant.product.originalPriceMinor,
            taxRateBps: TAX_RATE_BPS,
            taxMinor: includedTax(lineTotal),
            totalMinor: lineTotal,
          };
        }),
      },
      statusHistory: {
        create: [
          { toStatus: 'AWAITING_PAYMENT', createdAt: placedAt },
          { fromStatus: 'AWAITING_PAYMENT', toStatus: 'PAID', createdAt: placedAt },
          ...(opts.status !== 'PAID'
            ? [{ fromStatus: 'PAID' as const, toStatus: opts.status, createdAt: placedAt }]
            : []),
        ],
      },
      payments: {
        create: {
          provider: 'mock',
          providerPaymentId: `seed-${opts.orderNumber}`,
          status: 'PAID',
          amountMinor: total,
          idempotencyKey: `seed-${opts.orderNumber}`,
        },
      },
    },
  });

  // Reflect the sale in inventory so seeded numbers stay consistent.
  for (const item of opts.items) {
    const balance = await prisma.inventoryBalance.findUnique({
      where: { variantId: item.variant.id },
    });
    if (balance && balance.onHandQuantity - balance.reservedQuantity >= item.quantity) {
      await prisma.inventoryBalance.update({
        where: { variantId: item.variant.id },
        data: {
          onHandQuantity: { decrement: item.quantity },
          soldQuantity: { increment: item.quantity },
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          variantId: item.variant.id,
          type: 'SALE',
          quantityChange: -item.quantity,
          previousOnHand: balance.onHandQuantity,
          newOnHand: balance.onHandQuantity - item.quantity,
          reason: `Seed order ${opts.orderNumber}`,
          orderId: order.id,
        },
      });
    }
  }

  if (opts.status === 'SHIPPED' || opts.status === 'DELIVERED') {
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        carrier: 'DHL',
        trackingNumber: `TRK-${opts.orderNumber}`,
        status: opts.status === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED',
        shippedAt: placedAt,
        deliveredAt: opts.status === 'DELIVERED' ? placedAt : null,
      },
    });
  }

  return order.id;
}

export async function seedOrders(prisma: PrismaClient): Promise<void> {
  const shorts = await findVariant(prisma, 'PUM-TRN-PT-BLACK');
  const socks = await findVariant(prisma, 'NIK-SCK-AC-WHITE');
  const cap = await findVariant(prisma, 'CKN-CAP-AC-BLACK');
  const pants = await findVariant(prisma, 'ADI-TIR-PT-BLACK');

  if (!shorts || !socks || !cap || !pants) {
    console.warn('Seed orders skipped: expected variants not found');
    return;
  }

  const deliveredOrderId = await createSeedOrder(prisma, {
    orderNumber: 'OUT-100001',
    userEmail: 'customer@example.local',
    items: [
      { variant: shorts, quantity: 1 },
      { variant: socks, quantity: 2 },
    ],
    status: 'DELIVERED',
    daysAgo: 12,
  });

  await createSeedOrder(prisma, {
    orderNumber: 'OUT-100002',
    userEmail: 'customer2@example.local',
    items: [
      { variant: cap, quantity: 1 },
      { variant: pants, quantity: 1 },
    ],
    status: 'PROCESSING',
    daysAgo: 2,
  });

  // Example return request on the delivered order.
  if (deliveredOrderId) {
    const existingReturn = await prisma.returnRequest.findUnique({
      where: { rmaNumber: 'RMA-100001' },
    });
    if (!existingReturn) {
      const orderItem = await prisma.orderItem.findFirst({
        where: { orderId: deliveredOrderId, sku: shorts.sku },
      });
      if (orderItem) {
        const user = await prisma.user.findUnique({ where: { email: 'customer@example.local' } });
        await prisma.returnRequest.create({
          data: {
            rmaNumber: 'RMA-100001',
            orderId: deliveredOrderId,
            userId: user?.id,
            status: 'REQUESTED',
            reason: 'Wrong size',
            customerNote: 'Too small, would like a refund.',
            items: {
              create: [{ orderItemId: orderItem.id, quantity: 1, reason: 'Wrong size' }],
            },
          },
        });
      }
    }
  }

  console.log('Seeded example orders and a return request');
}
