import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type InventoryReservation } from '@outlet/database';
import { reservationExpiry } from '@outlet/domain';
import { QUEUE_NAMES, JOB_NAMES, type QueueClient } from '@outlet/queue';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../../common/settings.service';
import { AuditService } from '../../common/audit.service';
import { QUEUE_CLIENT } from '../../common/tokens';

export class OutOfStockError extends ConflictException {
  constructor(variantId: string) {
    super({
      statusCode: 409,
      code: 'OUT_OF_STOCK',
      message: 'This item is no longer available in the requested quantity.',
      variantId,
    });
  }
}

const HOLDING = ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'] as const;

/**
 * Inventory reservation engine. PostgreSQL is authoritative:
 *
 * - Stock acquisition uses a single atomic conditional UPDATE
 *   (`available >= qty` in the WHERE clause), so two concurrent buyers of
 *   the final unit can never both succeed — the second UPDATE matches zero
 *   rows and the request fails with OUT_OF_STOCK. No negative stock is
 *   possible (also enforced by DB CHECK constraints).
 * - Releases are idempotent: the status-guarded UPDATE flips the reservation
 *   out of a stock-holding status exactly once; only that winner returns
 *   stock. A delayed worker can therefore never double-release, and an
 *   expired reservation can never be re-used (state machine has no path out
 *   of EXPIRED).
 * - Redis/BullMQ only schedules expiration; correctness never depends on the
 *   job firing on time because every read/checkout path re-checks
 *   `expiresAt` against the database clock.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  async reservationDurationMinutes(): Promise<number> {
    return (await this.settings.get()).reservationDurationMinutes;
  }

  /**
   * Atomically acquire `quantity` units for a cart item. Creates the
   * reservation row with a server-side expiration timestamp.
   */
  async reserve(args: {
    cartId: string;
    cartItemId: string;
    variantId: string;
    quantity: number;
    userId?: string | null;
    sessionToken?: string | null;
  }): Promise<InventoryReservation> {
    const durationMinutes = await this.reservationDurationMinutes();
    const expiresAt = reservationExpiry(new Date(), durationMinutes);

    const reservation = await this.prisma.$transaction(async (tx) => {
      const acquired = await tx.$executeRaw`
        UPDATE "inventory_balances"
        SET "reservedQuantity" = "reservedQuantity" + ${args.quantity},
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "variantId" = ${args.variantId}
          AND ("onHandQuantity" - "reservedQuantity") >= ${args.quantity}
      `;
      if (acquired === 0) {
        throw new OutOfStockError(args.variantId);
      }
      return tx.inventoryReservation.create({
        data: {
          cartId: args.cartId,
          cartItemId: args.cartItemId,
          variantId: args.variantId,
          quantity: args.quantity,
          userId: args.userId ?? null,
          sessionToken: args.sessionToken ?? null,
          status: 'ACTIVE',
          expiresAt,
        },
      });
    });

    // Best-effort scheduled expiration; the sweep and lazy checks are the
    // safety net if this job is lost or late.
    await this.queue
      .enqueue(
        QUEUE_NAMES.reservations,
        JOB_NAMES.expireReservation,
        { reservationId: reservation.id },
        { delayMs: durationMinutes * 60_000 + 2_000, jobId: `expire:${reservation.id}` },
      )
      .catch(() => undefined);

    return reservation;
  }

  /**
   * Change the reserved quantity for a cart item without resetting the
   * timer. Increases must atomically acquire the delta; decreases release it.
   */
  async adjustQuantity(reservationId: string, newQuantity: number): Promise<InventoryReservation> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.inventoryReservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (!HOLDING.includes(reservation.status as (typeof HOLDING)[number])) {
        throw new ConflictException('Reservation is no longer active.');
      }
      if (reservation.expiresAt <= new Date()) {
        throw new ConflictException('Reservation has expired.');
      }
      const delta = newQuantity - reservation.quantity;
      if (delta === 0) return reservation;

      if (delta > 0) {
        const acquired = await tx.$executeRaw`
          UPDATE "inventory_balances"
          SET "reservedQuantity" = "reservedQuantity" + ${delta},
              "version" = "version" + 1,
              "updatedAt" = NOW()
          WHERE "variantId" = ${reservation.variantId}
            AND ("onHandQuantity" - "reservedQuantity") >= ${delta}
        `;
        if (acquired === 0) throw new OutOfStockError(reservation.variantId);
      } else {
        await tx.$executeRaw`
          UPDATE "inventory_balances"
          SET "reservedQuantity" = "reservedQuantity" + ${delta},
              "version" = "version" + 1,
              "updatedAt" = NOW()
          WHERE "variantId" = ${reservation.variantId}
        `;
      }
      return tx.inventoryReservation.update({
        where: { id: reservationId },
        data: { quantity: newQuantity },
      });
    });
  }

  /**
   * Idempotently release a reservation (EXPIRED or CANCELLED) and return the
   * held stock. Safe to call multiple times and from multiple processes.
   */
  async release(
    reservationId: string,
    toStatus: 'EXPIRED' | 'CANCELLED',
    reason: string,
    actor?: { userId?: string; email?: string; type?: 'ADMIN' | 'SYSTEM' | 'CUSTOMER' },
  ): Promise<boolean> {
    const released = await this.prisma.$transaction(async (tx) => {
      // Guarded status flip — exactly one caller wins.
      const flipped = await tx.inventoryReservation.updateMany({
        where: { id: reservationId, status: { in: [...HOLDING] } },
        data: { status: toStatus, cancelledReason: reason },
      });
      if (flipped.count === 0) return false;

      const reservation = await tx.inventoryReservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) return false;

      await tx.$executeRaw`
        UPDATE "inventory_balances"
        SET "reservedQuantity" = GREATEST("reservedQuantity" - ${reservation.quantity}, 0),
            "version" = "version" + 1,
            "updatedAt" = NOW()
        WHERE "variantId" = ${reservation.variantId}
      `;

      // Remove the now-invalid cart line so carts self-heal.
      if (reservation.cartItemId) {
        await tx.cartItem.deleteMany({ where: { id: reservation.cartItemId } });
      }
      return true;
    });

    if (released) {
      await this.audit.log({
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        actorType: actor?.type ?? 'SYSTEM',
        action: toStatus === 'EXPIRED' ? 'reservation.expired' : 'reservation.cancelled',
        entityType: 'InventoryReservation',
        entityId: reservationId,
        reason,
      });
    }
    return released;
  }

  /** Release every stock-holding reservation whose deadline has passed. */
  async expireDueReservations(limit = 200): Promise<number> {
    const due = await this.prisma.inventoryReservation.findMany({
      where: { status: { in: [...HOLDING] }, expiresAt: { lte: new Date() } },
      select: { id: true },
      take: limit,
    });
    let released = 0;
    for (const { id } of due) {
      if (await this.release(id, 'EXPIRED', 'Reservation window elapsed')) released += 1;
    }
    return released;
  }

  /** Lazily expire any due reservations for one cart (cart load/update). */
  async expireDueForCart(cartId: string): Promise<number> {
    const due = await this.prisma.inventoryReservation.findMany({
      where: { cartId, status: { in: [...HOLDING] }, expiresAt: { lte: new Date() } },
      select: { id: true },
    });
    let released = 0;
    for (const { id } of due) {
      if (await this.release(id, 'EXPIRED', 'Reservation window elapsed')) released += 1;
    }
    return released;
  }

  /** Mark a cart's live reservations as CHECKOUT_STARTED (no time extension). */
  async markCheckoutStarted(cartId: string): Promise<void> {
    await this.prisma.inventoryReservation.updateMany({
      where: { cartId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      data: { status: 'CHECKOUT_STARTED' },
    });
  }

  /** Attach reservations to an order at payment creation. */
  async markPaymentProcessing(cartId: string, orderId: string): Promise<void> {
    await this.prisma.inventoryReservation.updateMany({
      where: {
        cartId,
        status: { in: ['ACTIVE', 'CHECKOUT_STARTED'] },
        expiresAt: { gt: new Date() },
      },
      data: { status: 'PAYMENT_PROCESSING', orderId },
    });
  }

  /** Live (non-expired, stock-holding) reservations for a cart. */
  async liveReservationsForCart(cartId: string): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: { cartId, status: { in: [...HOLDING] }, expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Convert an order's reservations into sold stock after payment succeeds.
   *
   * Policy for payments arriving after expiration (documented, no silent
   * overselling): for each order item we first try to convert the live
   * reservation; if it expired, we attempt a direct atomic re-acquisition of
   * stock. If any item cannot be secured, the transaction rolls back and the
   * caller must refund the payment and cancel the order.
   */
  async convertReservationsToSale(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: Array<{ variantId: string | null; quantity: number }>,
  ): Promise<{ ok: true } | { ok: false; failedVariantId: string }> {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, status: { in: [...HOLDING] } },
    });
    const reservedByVariant = new Map<string, { id: string; quantity: number; expiresAt: Date }[]>();
    for (const r of reservations) {
      const list = reservedByVariant.get(r.variantId) ?? [];
      list.push({ id: r.id, quantity: r.quantity, expiresAt: r.expiresAt });
      reservedByVariant.set(r.variantId, list);
    }

    const now = new Date();
    for (const item of items) {
      if (!item.variantId) continue;
      const held = reservedByVariant.get(item.variantId) ?? [];
      const live = held.filter((r) => r.expiresAt > now);
      const liveQty = live.reduce((s, r) => s + r.quantity, 0);

      const fromReservation = Math.min(liveQty, item.quantity);
      const directNeeded = item.quantity - fromReservation;

      if (fromReservation > 0) {
        // Consume reservation: reserved -> sold, on-hand decreases.
        const updated = await tx.$executeRaw`
          UPDATE "inventory_balances"
          SET "reservedQuantity" = "reservedQuantity" - ${fromReservation},
              "onHandQuantity" = "onHandQuantity" - ${fromReservation},
              "soldQuantity" = "soldQuantity" + ${fromReservation},
              "version" = "version" + 1,
              "updatedAt" = NOW()
          WHERE "variantId" = ${item.variantId}
            AND "reservedQuantity" >= ${fromReservation}
            AND "onHandQuantity" >= ${fromReservation}
        `;
        if (updated === 0) return { ok: false, failedVariantId: item.variantId };
      }
      if (directNeeded > 0) {
        // Reservation lapsed — take remaining stock only if truly available.
        const updated = await tx.$executeRaw`
          UPDATE "inventory_balances"
          SET "onHandQuantity" = "onHandQuantity" - ${directNeeded},
              "soldQuantity" = "soldQuantity" + ${directNeeded},
              "version" = "version" + 1,
              "updatedAt" = NOW()
          WHERE "variantId" = ${item.variantId}
            AND ("onHandQuantity" - "reservedQuantity") >= ${directNeeded}
        `;
        if (updated === 0) return { ok: false, failedVariantId: item.variantId };
      }

      const balance = await tx.inventoryBalance.findUnique({
        where: { variantId: item.variantId },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          type: 'SALE',
          quantityChange: -item.quantity,
          previousOnHand: (balance?.onHandQuantity ?? 0) + item.quantity,
          newOnHand: balance?.onHandQuantity ?? 0,
          reason: 'Order paid',
          orderId,
        },
      });
    }

    await tx.inventoryReservation.updateMany({
      where: { orderId, status: { in: [...HOLDING] } },
      data: { status: 'CONVERTED', convertedAt: now },
    });
    return { ok: true };
  }

  /** Release any still-holding reservations of an order (payment failed). */
  async releaseOrderReservations(orderId: string, reason: string): Promise<void> {
    const held = await this.prisma.inventoryReservation.findMany({
      where: { orderId, status: { in: [...HOLDING] } },
      select: { id: true },
    });
    for (const { id } of held) {
      await this.release(id, 'CANCELLED', reason);
    }
  }
}
