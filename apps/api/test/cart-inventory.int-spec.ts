import {
  createTestContext,
  resetDatabase,
  seedVariant,
  getBalance,
  type TestContext,
} from './helpers';

describe('cart merging & inventory adjustments (integration)', () => {
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

  async function createUser(email: string) {
    return ctx.prisma.user.create({
      data: { email, passwordHash: 'x', firstName: 'T', lastName: 'U', isEmailVerified: true },
    });
  }

  it('merges an anonymous cart into the user cart without resetting timers', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 5 });
    const user = await createUser('merge@example.local');

    // Anonymous shopper reserves an item.
    await ctx.carts.addItem(
      { cartToken: 'anon_merge' },
      { variantId: fixture.variantId, quantity: 2 },
    );
    const anonCart = await ctx.prisma.cart.findFirstOrThrow({
      where: { anonymousToken: 'anon_merge' },
    });
    const before = await ctx.prisma.inventoryReservation.findFirstOrThrow({
      where: { cartId: anonCart.id },
    });

    await ctx.carts.mergeAnonymousCartIntoUser('anon_merge', user.id);

    const userCart = await ctx.prisma.cart.findFirstOrThrow({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { items: true },
    });
    expect(userCart.items).toHaveLength(1);
    expect(userCart.items[0].quantity).toBe(2);

    const after = await ctx.prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: before.id },
    });
    // Same reservation row, same deadline — login must never extend it.
    expect(after.cartId).toBe(userCart.id);
    expect(after.userId).toBe(user.id);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());

    const oldCart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: anonCart.id } });
    expect(oldCart.status).toBe('MERGED');
  });

  it('merge with a conflicting line keeps the user item and releases the duplicate hold', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 5 });
    const user = await createUser('conflict@example.local');

    await ctx.carts.addItem({ userId: user.id }, { variantId: fixture.variantId, quantity: 1 });
    await ctx.carts.addItem(
      { cartToken: 'anon_conflict' },
      { variantId: fixture.variantId, quantity: 3 },
    );

    await ctx.carts.mergeAnonymousCartIntoUser('anon_conflict', user.id);

    const userCart = await ctx.prisma.cart.findFirstOrThrow({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { items: true },
    });
    expect(userCart.items).toHaveLength(1);
    expect(userCart.items[0].quantity).toBe(1); // the user's own line wins

    const balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(1); // duplicate hold released
  });

  it('quantity changes adjust the hold atomically without touching the deadline', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 3 });
    await ctx.carts.addItem({ cartToken: 'qty_tok' }, { variantId: fixture.variantId, quantity: 1 });
    const cart = await ctx.prisma.cart.findFirstOrThrow({
      where: { anonymousToken: 'qty_tok' },
      include: { items: true },
    });
    const before = await ctx.prisma.inventoryReservation.findFirstOrThrow({
      where: { cartId: cart.id },
    });

    await ctx.carts.changeItemQuantity(cart.id, cart.items[0].id, 3);
    let balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(3);

    const after = await ctx.prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());

    // Increasing beyond stock fails without corrupting the hold.
    await expect(ctx.carts.changeItemQuantity(cart.id, cart.items[0].id, 4)).rejects.toThrow();
    balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.reservedQuantity).toBe(3);
  });

  it('inventory adjustments are recorded and can never eat reserved stock', async () => {
    const fixture = await seedVariant(ctx.prisma, { stock: 5 });
    const admin = { userId: 'admin-test', email: 'admin@example.local' };

    await ctx.carts.addItem({ cartToken: 'inv_tok' }, { variantId: fixture.variantId, quantity: 2 });

    // Restock +5
    await ctx.inventory.adjust(
      { variantId: fixture.variantId, type: 'RESTOCK', quantity: 5, reason: 'delivery' },
      admin,
    );
    let balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(10);

    // Damaged -3
    await ctx.inventory.adjust(
      { variantId: fixture.variantId, type: 'DAMAGED', quantity: 3, reason: 'water damage' },
      admin,
    );
    balance = await getBalance(ctx.prisma, fixture.variantId);
    expect(balance.onHandQuantity).toBe(7);
    expect(balance.damagedQuantity).toBe(3);

    // Correction below the reserved quantity (2) must be rejected.
    await expect(
      ctx.inventory.adjust(
        { variantId: fixture.variantId, type: 'CORRECTION', quantity: 1, reason: 'bad count' },
        admin,
      ),
    ).rejects.toThrow(/reserved/i);

    // Every change produced a movement with before/after values.
    const movements = await ctx.prisma.inventoryMovement.findMany({
      where: { variantId: fixture.variantId },
      orderBy: { createdAt: 'asc' },
    });
    const types = movements.map((m) => m.type);
    expect(types).toEqual(expect.arrayContaining(['RESTOCK', 'DAMAGED']));
    for (const movement of movements) {
      expect(movement.newOnHand).toBe(movement.previousOnHand + movement.quantityChange);
    }
  });
});
