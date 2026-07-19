import type { PrismaClient } from '@outlet/database';

const HOLDING = ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'] as const;

/**
 * Idempotent reservation release, mirroring the guarded operations in the
 * API's ReservationsService.release(). The status-guarded flip means the API
 * (lazy checks) and this worker can race on the same reservation and stock is
 * still returned exactly once. A delayed job can never release a reservation
 * that was already converted to an order.
 */
export async function releaseReservation(
  prisma: PrismaClient,
  reservationId: string,
  reason: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const flipped = await tx.inventoryReservation.updateMany({
      where: { id: reservationId, status: { in: [...HOLDING] } },
      data: { status: 'EXPIRED', cancelledReason: reason },
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
    if (reservation.cartItemId) {
      await tx.cartItem.deleteMany({ where: { id: reservation.cartItemId } });
    }
    await tx.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'reservation.expired',
        entityType: 'InventoryReservation',
        entityId: reservationId,
        reason,
      },
    });
    return true;
  });
}

/**
 * Only release when the deadline has truly passed on the database clock —
 * a delayed or early-firing job must never expire a live reservation.
 */
export async function expireReservationIfDue(
  prisma: PrismaClient,
  reservationId: string,
): Promise<boolean> {
  const reservation = await prisma.inventoryReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation) return false;
  if (!HOLDING.includes(reservation.status as (typeof HOLDING)[number])) return false;
  if (reservation.expiresAt > new Date()) return false;
  return releaseReservation(prisma, reservationId, 'Reservation window elapsed (worker)');
}

/** Safety-net sweep for reservations whose delayed jobs were lost. */
export async function sweepExpiredReservations(prisma: PrismaClient, limit = 500): Promise<number> {
  const due = await prisma.inventoryReservation.findMany({
    where: { status: { in: [...HOLDING] }, expiresAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
  });
  let released = 0;
  for (const { id } of due) {
    if (await releaseReservation(prisma, id, 'Reservation window elapsed (sweep)')) {
      released += 1;
    }
  }
  return released;
}
