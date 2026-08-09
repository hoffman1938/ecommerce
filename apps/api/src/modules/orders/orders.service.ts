import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Order,
  OrderItem,
  OrderStatusHistory,
  Payment,
  Prisma,
  Shipment,
  ShipmentEvent,
} from '@outlet/database';
import { assertTransition, CANCELLABLE_ORDER_STATUSES, ORDER_TRANSITIONS } from '@outlet/domain';
import type { AddressDto, OrderDto } from '@outlet/types';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { QUEUE_NAMES, JOB_NAMES, type QueueClient } from '@outlet/queue';
import { Inject } from '@nestjs/common';
import { QUEUE_CLIENT } from '../../common/tokens';

type OrderWithRelations = Order & {
  items: OrderItem[];
  payments: Payment[];
  shipments: Array<Shipment & { events: ShipmentEvent[] }>;
  statusHistory: OrderStatusHistory[];
};

const ORDER_INCLUDE = {
  items: true,
  payments: { orderBy: { createdAt: 'asc' as const } },
  shipments: {
    orderBy: { createdAt: 'asc' as const },
    include: { events: { orderBy: { occurredAt: 'asc' as const } } },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  /** Sequential-looking, collision-safe order numbers (OUT-100xxx). */
  async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.order.count();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `OUT-${100000 + count + 1 + attempt}`;
      const exists = await tx.order.findUnique({ where: { orderNumber: candidate } });
      if (!exists) return candidate;
    }
    return `OUT-${100000 + count + 1}-${Date.now().toString(36).toUpperCase()}`;
  }

  toOrderDto(order: OrderWithRelations): OrderDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      currencyCode: order.currencyCode,
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      couponCode: order.couponCode,
      email: order.email,
      shippingAddress: order.shippingAddress as unknown as AddressDto,
      billingAddress: order.billingAddress as unknown as AddressDto,
      shippingMethod: order.shippingMethod,
      items: order.items.map((item) => {
        const snapshot = item.productSnapshot as Record<string, unknown>;
        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          brandName: (snapshot.brandName as string) ?? null,
          size: (snapshot.size as string) ?? null,
          color: (snapshot.color as string) ?? null,
          imageUrl: (snapshot.imageUrl as string) ?? null,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          totalMinor: item.totalMinor,
          returnedQuantity: item.returnedQuantity,
          returnableQuantity: Math.max(0, item.quantity - item.returnedQuantity),
        };
      }),
      payments: order.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amountMinor: p.amountMinor,
        refundedAmountMinor: p.refundedAmountMinor,
        failureReason: p.failureReason,
        createdAt: p.createdAt.toISOString(),
      })),
      shipments: order.shipments.map((s) => ({
        id: s.id,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        status: s.status,
        shippedAt: s.shippedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
        events: s.events.map((event) => ({
          code: event.code,
          label: event.label,
          at: event.occurredAt.toISOString(),
          location: event.location,
        })),
      })),
      timeline: order.statusHistory.map((entry) => ({
        status: entry.toStatus,
        at: entry.createdAt.toISOString(),
        note: entry.note,
      })),
      placedAt: order.placedAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      isCancellable: CANCELLABLE_ORDER_STATUSES.includes(order.status),
      createdAt: order.createdAt.toISOString(),
    };
  }

  async getOrderForUser(orderId: string, userId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toOrderDto(order);
  }

  async listOrdersForUser(userId: string): Promise<OrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId, status: { not: 'DRAFT' } },
      include: ORDER_INCLUDE,
      orderBy: { placedAt: 'desc' },
      take: 100,
    });
    return orders.map((o) => this.toOrderDto(o));
  }

  /**
   * Customer-initiated cancellation. Ownership is checked here rather than in
   * the controller so no caller can cancel someone else's order by id, and the
   * transition itself reuses the admin path so the state machine, inventory
   * restock and audit trail behave identically.
   */
  async cancelOwnOrder(
    orderId: string,
    user: { id: string; email: string },
    reason?: string | null,
  ): Promise<OrderDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException(
        `An order that is already ${order.status.toLowerCase().replace(/_/g, ' ')} can no longer be cancelled.`,
      );
    }
    return this.updateStatus(
      orderId,
      { status: 'CANCELLED', note: reason ?? 'Cancelled by customer' },
      { userId: user.id, email: user.email },
    );
  }

  /**
   * Admin fulfillment transitions with the order state machine enforced and
   * inventory/emails handled as side effects.
   */
  async updateStatus(
    orderId: string,
    input: {
      status: 'PROCESSING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
      note?: string | null;
      trackingNumber?: string | null;
      carrier?: string | null;
    },
    actor: { userId: string; email: string },
  ): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (input.status === 'CANCELLED' && !CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException(`Order in status ${order.status} cannot be cancelled.`);
    }
    assertTransition('order', ORDER_TRANSITIONS, order.status, input.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: input.status,
          cancelledAt: input.status === 'CANCELLED' ? new Date() : undefined,
          cancelReason: input.status === 'CANCELLED' ? (input.note ?? 'Cancelled') : undefined,
          version: { increment: 1 },
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: input.status,
          note: input.note,
          actorUserId: actor.userId,
        },
      });

      if (input.status === 'SHIPPED') {
        const existing = await tx.shipment.findFirst({ where: { orderId } });
        const shipment = existing
          ? await tx.shipment.update({
              where: { id: existing.id },
              data: {
                status: 'SHIPPED',
                shippedAt: new Date(),
                trackingNumber: input.trackingNumber ?? existing.trackingNumber,
                carrier: input.carrier ?? existing.carrier,
              },
            })
          : await tx.shipment.create({
              data: {
                orderId,
                status: 'SHIPPED',
                shippedAt: new Date(),
                trackingNumber: input.trackingNumber,
                carrier: input.carrier ?? 'DHL',
              },
            });
        // The customer's tracking timeline reads these scans, so a shipment
        // marked shipped with no first scan would render as an empty timeline.
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            code: 'HANDED_OVER',
            label: 'Handed to carrier',
            location: null,
          },
        });
      }
      if (input.status === 'DELIVERED') {
        const shipments = await tx.shipment.findMany({ where: { orderId } });
        await tx.shipment.updateMany({
          where: { orderId },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        for (const shipment of shipments) {
          await tx.shipmentEvent.create({
            data: {
              shipmentId: shipment.id,
              code: 'DELIVERED',
              label: 'Delivered',
              location: null,
            },
          });
        }
      }

      // Cancelling a paid-but-unshipped order returns sold units to stock.
      if (input.status === 'CANCELLED' && order.paidAt) {
        for (const item of order.items) {
          if (!item.variantId) continue;
          const balance = await tx.inventoryBalance.findUnique({
            where: { variantId: item.variantId },
          });
          if (!balance) continue;
          await tx.inventoryBalance.update({
            where: { variantId: item.variantId },
            data: {
              onHandQuantity: { increment: item.quantity },
              soldQuantity: { decrement: Math.min(item.quantity, balance.soldQuantity) },
            },
          });
          await tx.inventoryMovement.create({
            data: {
              variantId: item.variantId,
              type: 'RELEASE',
              quantityChange: item.quantity,
              previousOnHand: balance.onHandQuantity,
              newOnHand: balance.onHandQuantity + item.quantity,
              reason: `Order ${order.orderNumber} cancelled`,
              actorUserId: actor.userId,
              orderId,
            },
          });
        }
      }
    });

    if (input.status === 'SHIPPED') {
      await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
        kind: 'shipment',
        to: order.email,
        data: {
          orderNumber: order.orderNumber,
          trackingNumber: input.trackingNumber ?? null,
          orderId,
        },
      });
    }

    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: `order.status.${input.status.toLowerCase()}`,
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: { status: input.status },
      reason: input.note ?? undefined,
    });

    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    return this.toOrderDto(updated);
  }

  async addInternalNote(orderId: string, note: string, actorUserId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const combined = order.internalNote ? `${order.internalNote}\n---\n${note}` : note;
    await this.prisma.order.update({ where: { id: orderId }, data: { internalNote: combined } });
    await this.prisma.orderStatusHistory.create({
      data: { orderId, toStatus: order.status, fromStatus: order.status, note, actorUserId },
    });
  }

  async resendConfirmationEmail(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.paidAt) throw new BadRequestException('Order has no successful payment yet.');
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'order-confirmation',
      to: order.email,
      data: {
        orderNumber: order.orderNumber,
        totalMinor: order.totalMinor,
        currencyCode: order.currencyCode,
        items: order.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          totalMinor: i.totalMinor,
        })),
        orderId: order.id,
      },
    });
  }
}
