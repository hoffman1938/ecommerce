import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@outlet/database';
import type { InventoryAdjustInput } from '@outlet/validation';
import type { InventoryRowDto } from '@outlet/types';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ReservationsService } from '../reservations/reservations.service';

type Actor = { userId: string; email: string };

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reservations: ReservationsService,
  ) {}

  async listInventory(query: {
    q?: string;
    lowStockOnly?: boolean;
    lowStockThreshold?: number;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ProductVariantWhereInput = query.q
      ? {
          OR: [
            { sku: { contains: query.q, mode: 'insensitive' } },
            { product: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [variants, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        include: { product: { include: { brand: true } }, inventory: true },
        orderBy: { sku: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    let rows: InventoryRowDto[] = variants.map((v) => {
      const inv = v.inventory;
      const onHand = inv?.onHandQuantity ?? 0;
      const reserved = inv?.reservedQuantity ?? 0;
      return {
        variantId: v.id,
        sku: v.sku,
        productId: v.productId,
        productName: v.product.name,
        brandName: v.product.brand.name,
        size: v.size,
        color: v.color,
        onHandQuantity: onHand,
        reservedQuantity: reserved,
        soldQuantity: inv?.soldQuantity ?? 0,
        damagedQuantity: inv?.damagedQuantity ?? 0,
        returnedQuantity: inv?.returnedQuantity ?? 0,
        availableQuantity: Math.max(0, onHand - reserved),
        isEnabled: v.isEnabled,
      };
    });
    if (query.lowStockOnly) {
      const threshold = query.lowStockThreshold ?? 5;
      rows = rows.filter((r) => r.availableQuantity <= threshold);
    }
    return {
      items: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * Manual stock changes. Every adjustment records the administrator, SKU,
   * previous value, new value, difference, reason, and timestamp (spec).
   * Decreases can never eat into reserved stock or go negative.
   */
  async adjust(input: InventoryAdjustInput, actor: Actor) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { inventory: true },
    });
    if (!variant || !variant.inventory) throw new NotFoundException('Variant not found');

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: { variantId: input.variantId },
      });
      const previous = balance.onHandQuantity;
      let next: number;
      let damagedDelta = 0;

      switch (input.type) {
        case 'RESTOCK':
        case 'ADJUSTMENT_INCREASE': {
          if (input.quantity <= 0) {
            throw new BadRequestException('Increase quantity must be positive.');
          }
          next = previous + input.quantity;
          break;
        }
        case 'ADJUSTMENT_DECREASE':
        case 'DAMAGED': {
          if (input.quantity <= 0) {
            throw new BadRequestException('Decrease quantity must be positive.');
          }
          next = previous - input.quantity;
          if (next < balance.reservedQuantity) {
            throw new ConflictException(
              'Cannot reduce stock below the currently reserved quantity.',
            );
          }
          if (input.type === 'DAMAGED') damagedDelta = input.quantity;
          break;
        }
        case 'CORRECTION': {
          if (input.quantity < 0) {
            throw new BadRequestException('Corrected stock cannot be negative.');
          }
          next = input.quantity;
          if (next < balance.reservedQuantity) {
            throw new ConflictException(
              'Corrected stock cannot be below the currently reserved quantity.',
            );
          }
          break;
        }
        default:
          throw new BadRequestException('Unsupported adjustment type.');
      }

      const updated = await tx.inventoryBalance.update({
        where: { variantId: input.variantId },
        data: {
          onHandQuantity: next,
          damagedQuantity: damagedDelta > 0 ? { increment: damagedDelta } : undefined,
          version: { increment: 1 },
        },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          variantId: input.variantId,
          type: input.type,
          quantityChange: next - previous,
          previousOnHand: previous,
          newOnHand: next,
          reason: input.reason,
          actorUserId: actor.userId,
        },
      });
      await this.audit.log({
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'ADMIN',
        action: `inventory.${input.type.toLowerCase()}`,
        entityType: 'InventoryBalance',
        entityId: variant.id,
        before: { onHandQuantity: previous },
        after: { onHandQuantity: next },
        reason: input.reason,
      });
      return { balance: updated, movement };
    });
  }

  async listMovements(query: { variantId?: string; page: number; pageSize: number }) {
    const where = query.variantId ? { variantId: query.variantId } : {};
    const [movements, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { variant: { select: { sku: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    const actorIds = [...new Set(movements.map((m) => m.actorUserId).filter(Boolean))] as string[];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(actors.map((a) => [a.id, a.email]));
    return {
      items: movements.map((m) => ({
        id: m.id,
        variantId: m.variantId,
        sku: m.variant.sku,
        type: m.type,
        quantityChange: m.quantityChange,
        previousOnHand: m.previousOnHand,
        newOnHand: m.newOnHand,
        reason: m.reason,
        actorEmail: m.actorUserId ? (emailById.get(m.actorUserId) ?? null) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listReservations(query: { status?: string; page: number; pageSize: number }) {
    const where: Prisma.InventoryReservationWhereInput = query.status
      ? { status: query.status as never }
      : {};
    const [reservations, total] = await Promise.all([
      this.prisma.inventoryReservation.findMany({
        where,
        include: {
          variant: { include: { product: { select: { name: true } } } },
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryReservation.count({ where }),
    ]);
    return {
      items: reservations.map((r) => ({
        id: r.id,
        sku: r.variant.sku,
        productName: r.variant.product.name,
        quantity: r.quantity,
        status: r.status,
        customerEmail: r.user?.email ?? null,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async cancelReservation(reservationId: string, reason: string, actor: Actor) {
    const released = await this.reservations.release(reservationId, 'CANCELLED', reason, {
      userId: actor.userId,
      email: actor.email,
      type: 'ADMIN',
    });
    if (!released) {
      throw new ConflictException(
        'Reservation is not active (already converted, expired, or cancelled).',
      );
    }
    return { released: true };
  }

  async exportInventoryCsv(): Promise<string> {
    const variants = await this.prisma.productVariant.findMany({
      include: { product: true, inventory: true },
      orderBy: { sku: 'asc' },
    });
    const header =
      'sku,productSlug,onHandQuantity,reservedQuantity,availableQuantity,soldQuantity,damagedQuantity,returnedQuantity';
    const rows = variants.map((v) => {
      const inv = v.inventory;
      const onHand = inv?.onHandQuantity ?? 0;
      const reserved = inv?.reservedQuantity ?? 0;
      return [
        v.sku,
        v.product.slug,
        onHand,
        reserved,
        Math.max(0, onHand - reserved),
        inv?.soldQuantity ?? 0,
        inv?.damagedQuantity ?? 0,
        inv?.returnedQuantity ?? 0,
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  /** CSV import applies CORRECTION rows: sku,newOnHandQuantity,reason */
  async importInventoryCsv(csv: string, actor: Actor) {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('CSV file has no data rows.');
    const header = lines[0].split(',').map((h) => h.trim());
    const skuIdx = header.indexOf('sku');
    const qtyIdx = header.indexOf('newOnHandQuantity');
    if (skuIdx < 0 || qtyIdx < 0) {
      throw new BadRequestException('CSV must contain "sku" and "newOnHandQuantity" columns.');
    }
    const reasonIdx = header.indexOf('reason');
    let applied = 0;
    let skipped = 0;
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map((c) => c.trim());
      const sku = cols[skuIdx];
      const qty = parseInt(cols[qtyIdx] ?? '', 10);
      if (!sku || Number.isNaN(qty) || qty < 0) {
        skipped += 1;
        continue;
      }
      const variant = await this.prisma.productVariant.findUnique({ where: { sku } });
      if (!variant) {
        skipped += 1;
        continue;
      }
      try {
        await this.adjust(
          {
            variantId: variant.id,
            type: 'CORRECTION',
            quantity: qty,
            reason: (reasonIdx >= 0 ? cols[reasonIdx] : '') || 'CSV inventory import',
          },
          actor,
        );
        applied += 1;
      } catch {
        skipped += 1;
      }
    }
    return { applied, skipped };
  }
}
