import {
  createTestContext,
  resetDatabase,
  seedVariant,
  createCart,
  getBalance,
  type TestContext,
} from './helpers';
import { OutOfStockError } from '../src/modules/reservations/reservations.service';

describe('inventory reservations (integration)', () => {
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

  it('creates a reservation and holds stock', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 3 });
    const cart = await createCart(ctx.prisma);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 2, unitPriceMinor: 2000 },
    });

    const reservation = await ctx.reservations.reserve({
      cartId: cart.id,
      cartItemId: item.id,
      variantId: fixture.variantId,
      quantity: 2,
    });

    expect(reservation.status).toBe('ACTIVE');
    expect(reservation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 19 * 60_000);

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(3);
    expect(balance.reservedQuantity).toBe(2);
  });

  it('rejects reservations beyond available stock', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const cart = await createCart(ctx.prisma);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 2, unitPriceMinor: 2000 },
    });

    await expect(
      ctx.reservations.reserve({
        cartId: cart.id,
        cartItemId: item.id,
        variantId: fixture.variantId,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(OutOfStockError);

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(0);
  });

  it('release is idempotent and returns stock exactly once', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const cart = await createCart(ctx.prisma);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 1, unitPriceMinor: 2000 },
    });
    const reservation = await ctx.reservations.reserve({
      cartId: cart.id,
      cartItemId: item.id,
      variantId: fixture.variantId,
      quantity: 1,
    });

    const first = await ctx.reservations.release(reservation.id, 'CANCELLED', 'test');
    const second = await ctx.reservations.release(reservation.id, 'CANCELLED', 'test again');
    const third = await ctx.reservations.release(reservation.id, 'EXPIRED', 'and again');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(false);

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(0);
    expect(balance.onHandQuantity).toBe(1);
  });

  it('expires overdue reservations lazily and removes their cart items', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const cart = await createCart(ctx.prisma);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 1, unitPriceMinor: 2000 },
    });
    const reservation = await ctx.reservations.reserve({
      cartId: cart.id,
      cartItemId: item.id,
      variantId: fixture.variantId,
      quantity: 1,
    });
    // Force the deadline into the past — the server clock decides.
    await ctx.prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const released = await ctx.reservations.expireDueForCart(cart.id);
    expect(released).toBe(1);

    const after = await ctx.prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(after.status).toBe('EXPIRED');
    expect(await ctx.prisma.cartItem.findUnique({ where: { id: item.id } })).toBeNull();
    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(0);
  });

  it('an expired reservation can never be converted', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });
    const cart = await createCart(ctx.prisma);
    const item = await ctx.prisma.cartItem.create({
      data: { cartId: cart.id, variantId: fixture.variantId, quantity: 1, unitPriceMinor: 2000 },
    });
    const reservation = await ctx.reservations.reserve({
      cartId: cart.id,
      cartItemId: item.id,
      variantId: fixture.variantId,
      quantity: 1,
    });
    await ctx.reservations.release(reservation.id, 'EXPIRED', 'test expiry');

    // A delayed status flip must not resurrect the hold.
    const flipped = await ctx.prisma.inventoryReservation.updateMany({
      where: {
        id: reservation.id,
        status: { in: ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'] },
      },
      data: { status: 'CONVERTED' },
    });
    expect(flipped.count).toBe(0);
  });

  it('CONCURRENCY: 100 simultaneous attempts for the final unit — exactly one wins', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 1 });

    const attempts = await Promise.all(
      Array.from({ length: 100 }, async (_, index) => {
        const cart = await createCart(ctx.prisma, `concurrent_${index}`);
        const item = await ctx.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: fixture.variantId,
            quantity: 1,
            unitPriceMinor: 2000,
          },
        });
        return { cartId: cart.id, cartItemId: item.id };
      }),
    );

    const results = await Promise.allSettled(
      attempts.map((attempt) =>
        ctx.reservations.reserve({
          cartId: attempt.cartId,
          cartItemId: attempt.cartItemId,
          variantId: fixture.variantId,
          quantity: 1,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    // Exactly one success; 99 out-of-stock failures.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(99);
    for (const failure of rejected) {
      expect(failure.reason).toBeInstanceOf(OutOfStockError);
    }

    // Stock stays correct and never goes negative.
    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(1);
    expect(balance.reservedQuantity).toBe(1);
    expect(balance.onHandQuantity - balance.reservedQuantity).toBe(0);

    const holding = await ctx.prisma.inventoryReservation.count({
      where: { variantId: fixture.variantId, status: 'ACTIVE' },
    });
    expect(holding).toBe(1);
  }, 120_000);
});
