import {
  createTestContext,
  resetDatabase,
  seedVariant,
  createCart,
  getBalance,
  type TestContext,
} from './helpers';

/** Drives checkout + the mock provider exactly like the HTTP layer does. */
async function placeOrder(ctx: TestContext, variantId: string, quantity = 1) {
  const cartToken = `paytok_${Math.random().toString(36).slice(2)}`;
  const cart = await createCart(ctx.prisma, cartToken);
  const item = await ctx.prisma.cartItem.create({
    data: { cartId: cart.id, variantId, quantity, unitPriceMinor: 2000 },
  });
  await ctx.reservations.reserve({
    cartId: cart.id,
    cartItemId: item.id,
    variantId,
    quantity,
  });

  const address = {
    firstName: 'Test',
    lastName: 'Customer',
    line1: 'Street 1',
    line2: null,
    city: 'Berlin',
    region: null,
    postalCode: '10115',
    countryCode: 'DE',
    phone: null,
  };
  const settings = await ctx.settings.get();
  const subtotal = 2000 * quantity;
  const shipping =
    settings.freeShippingThresholdMinor != null && subtotal >= settings.freeShippingThresholdMinor
      ? 0
      : settings.standardShippingMinor;

  const session = await ctx.checkout.submit(
    { cartToken },
    {
      email: 'buyer@example.local',
      shippingAddress: address,
      billingAddress: address,
      billingSameAsShipping: true,
      shippingMethod: 'STANDARD',
      customerNote: null,
      expectedTotalMinor: subtotal + shipping,
      idempotencyKey: `idem_${Math.random().toString(36).slice(2)}`,
    },
  );
  return session;
}

async function deliverMockEvent(
  ctx: TestContext,
  outcome: 'TEST-SUCCESS' | 'TEST-FAIL' | 'TEST-CANCEL',
  paymentId: string,
  eventId?: string,
) {
  const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const payload = ctx.mockProvider.buildWebhookEvent({
    outcome,
    paymentId,
    amountMinor: payment.amountMinor,
    currencyCode: payment.currencyCode,
    eventId,
  });
  const raw = JSON.stringify(payload);
  return ctx.payments.handleWebhookRequest('mock', raw, ctx.mockProvider.signPayload(raw));
}

describe('checkout & mock payments (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  it('creates an order awaiting payment with recalculated totals', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 2 });
    const session = await placeOrder(ctx, fixture.variantId, 1);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: session.orderId },
      include: { items: true, payments: true },
    });
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.items).toHaveLength(1);
    expect(order.totalMinor).toBe(session.amountMinor);
    expect(order.payments[0].status).toBe('PENDING');
    expect(session.redirectUrl).toContain('/checkout/mock-payment');

    const reservations = await ctx.prisma.inventoryReservation.findMany({
      where: { orderId: order.id },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe('PAYMENT_PROCESSING');
  });

  it('rejects a submitted total that does not match the server calculation', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const cartToken = 'mismatch_tok';
    const cart = await createCart(ctx.prisma, cartToken);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 1, unitPriceMinor: 2000 },
    });
    await ctx.reservations.reserve({
      cartId: cart.id,
      cartItemId: item.id,
      variantId: fixture.variantId,
      quantity: 1,
    });
    const address = {
      firstName: 'T',
      lastName: 'C',
      line1: 'S 1',
      line2: null,
      city: 'B',
      region: null,
      postalCode: '10115',
      countryCode: 'DE',
      phone: null,
    };

    await expect(
      ctx.checkout.submit(
        { cartToken },
        {
          email: 'buyer@example.local',
          shippingAddress: address,
          billingAddress: address,
          billingSameAsShipping: true,
          shippingMethod: 'STANDARD',
          customerNote: null,
          expectedTotalMinor: 1, // tampered client total
          idempotencyKey: 'idem_mismatch',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'TOTALS_CHANGED' } });
  });

  it('payment success converts reservations to sales and marks the order paid', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const session = await placeOrder(ctx, fixture.variantId, 1);

    const result = await deliverMockEvent(ctx, 'TEST-SUCCESS', session.paymentId);
    expect(result.duplicate).toBe(false);

    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: session.orderId } });
    expect(order.status).toBe('PAID');
    expect(order.paidAt).not.toBeNull();

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(0);
    expect(balance.reservedQuantity).toBe(0);
    expect(balance.soldQuantity).toBe(1);

    const reservation = await ctx.prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(reservation.status).toBe('CONVERTED');
  });

  it('duplicate webhook deliveries are suppressed', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const session = await placeOrder(ctx, fixture.variantId, 1);

    const first = await deliverMockEvent(ctx, 'TEST-SUCCESS', session.paymentId, 'evt_dup_1');
    const second = await deliverMockEvent(ctx, 'TEST-SUCCESS', session.paymentId, 'evt_dup_1');

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    // Stock was only decremented once.
    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.soldQuantity).toBe(1);
    expect(balance.onHandQuantity).toBe(0);

    const events = await ctx.prisma.paymentEvent.count({
      where: { providerEventId: 'evt_dup_1' },
    });
    expect(events).toBe(1);
  });

  it('failed payment releases nothing but returns holds to ACTIVE for retry', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const session = await placeOrder(ctx, fixture.variantId, 1);

    await deliverMockEvent(ctx, 'TEST-FAIL', session.paymentId);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({
      where: { id: session.paymentId },
    });
    expect(payment.status).toBe('FAILED');
    expect(payment.failureReason).toContain('declined');

    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: session.orderId } });
    expect(order.status).toBe('AWAITING_PAYMENT');

    const reservation = await ctx.prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(reservation.status).toBe('ACTIVE'); // original expiry retained

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(1);
  });

  it('late success after expiry with stock gone: auto-refund, no overselling', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const session = await placeOrder(ctx, fixture.variantId, 1);

    // Reservation expires and the stock is taken by someone else.
    const reservation = await ctx.prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: session.orderId },
    });
    await ctx.reservations.release(reservation.id, 'EXPIRED', 'window elapsed');
    const rival = await createCart(ctx.prisma, 'rival');
    const rivalItem = await ctx.prisma.cartItem.create({
      data: { cartId: rival.id, variantId: fixture.variantId, quantity: 1, unitPriceMinor: 2000 },
    });
    const rivalReservation = await ctx.reservations.reserve({
      cartId: rival.id,
      cartItemId: rivalItem.id,
      variantId: fixture.variantId,
      quantity: 1,
    });
    expect(rivalReservation.status).toBe('ACTIVE');

    // The delayed success arrives anyway.
    await deliverMockEvent(ctx, 'TEST-SUCCESS', session.paymentId);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: session.orderId },
      include: { refunds: true },
    });
    expect(order.status).toBe('CANCELLED');
    expect(order.refunds).toHaveLength(1);
    expect(order.refunds[0].amountMinor).toBe(session.amountMinor);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({
      where: { id: session.paymentId },
    });
    expect(payment.status).toBe('REFUNDED');

    // The rival's hold is untouched; nothing oversold or negative.
    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(1);
    expect(balance.reservedQuantity).toBe(1);
    expect(balance.soldQuantity).toBe(0);
  });

  it('admin refunds respect the refundable remainder (partial then full)', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const session = await placeOrder(ctx, fixture.variantId, 1);
    await deliverMockEvent(ctx, 'TEST-SUCCESS', session.paymentId);

    const admin = { userId: 'admin-test', email: 'admin@example.local' };
    await ctx.payments.createRefund(
      { orderId: session.orderId, amountMinor: 500, reason: 'partial goodwill' },
      admin,
    );
    let payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    expect(payment.refundedAmountMinor).toBe(500);

    // Over-refund is rejected.
    await expect(
      ctx.payments.createRefund(
        { orderId: session.orderId, amountMinor: session.amountMinor, reason: 'too much' },
        admin,
      ),
    ).rejects.toThrow(/refundable/i);

    // Refund the exact remainder.
    await ctx.payments.createRefund(
      { orderId: session.orderId, amountMinor: session.amountMinor - 500, reason: 'rest' },
      admin,
    );
    payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: session.paymentId } });
    expect(payment.status).toBe('REFUNDED');
    expect(payment.refundedAmountMinor).toBe(session.amountMinor);
  });
});
