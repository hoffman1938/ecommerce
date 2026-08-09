import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { assertTransition, RETURN_TRANSITIONS, RETURNABLE_ORDER_STATUSES } from '@outlet/domain';
import { QUEUE_NAMES, JOB_NAMES, type QueueClient } from '@outlet/queue';
import type { ReturnRequestDto } from '@outlet/types';
import type {
  CreateReturnInput,
  ReceiveReturnItemsInput,
  ReturnDecisionInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { QUEUE_CLIENT } from '../../common/tokens';

const RETURN_INCLUDE = {
  order: { select: { orderNumber: true } },
  items: { include: { orderItem: true } },
  refunds: true,
} as const;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  private toDto(request: {
    id: string;
    rmaNumber: string;
    orderId: string;
    status: ReturnRequestDto['status'];
    reason: string;
    customerNote: string | null;
    createdAt: Date;
    order: { orderNumber: string };
    items: Array<{
      id: string;
      orderItemId: string;
      quantity: number;
      receivedQuantity: number;
      restockedQuantity: number;
      condition: ReturnRequestDto['items'][number]['condition'];
      reason: string | null;
      orderItem: { name: string; sku: string };
    }>;
    refunds: Array<{
      id: string;
      amountMinor: number;
      status: ReturnRequestDto['refunds'][number]['status'];
      reason: string | null;
      createdAt: Date;
    }>;
  }): ReturnRequestDto {
    return {
      id: request.id,
      rmaNumber: request.rmaNumber,
      orderId: request.orderId,
      orderNumber: request.order.orderNumber,
      status: request.status,
      reason: request.reason,
      customerNote: request.customerNote,
      items: request.items.map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        name: item.orderItem.name,
        sku: item.orderItem.sku,
        quantity: item.quantity,
        receivedQuantity: item.receivedQuantity,
        restockedQuantity: item.restockedQuantity,
        condition: item.condition,
        reason: item.reason,
      })),
      refunds: request.refunds.map((refund) => ({
        id: refund.id,
        amountMinor: refund.amountMinor,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      })),
      createdAt: request.createdAt.toISOString(),
    };
  }

  private async nextRmaNumber(): Promise<string> {
    const count = await this.prisma.returnRequest.count();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `RMA-${100000 + count + 1 + attempt}`;
      const exists = await this.prisma.returnRequest.findUnique({
        where: { rmaNumber: candidate },
      });
      if (!exists) return candidate;
    }
    return `RMA-${Date.now()}`;
  }

  // --- Customer side --------------------------------------------------------

  async createForCustomer(userId: string, input: CreateReturnInput): Promise<ReturnRequestDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, userId },
      include: { items: true, returnRequests: { include: { items: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!RETURNABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        'Returns can only be requested for shipped or delivered orders.',
      );
    }

    // Quantity guard: requested + already-in-flight must fit the order line.
    const inFlightByItem = new Map<string, number>();
    for (const request of order.returnRequests) {
      if (['REJECTED', 'CANCELLED'].includes(request.status)) continue;
      for (const item of request.items) {
        inFlightByItem.set(
          item.orderItemId,
          (inFlightByItem.get(item.orderItemId) ?? 0) + item.quantity,
        );
      }
    }
    for (const item of input.items) {
      const orderItem = order.items.find((oi) => oi.id === item.orderItemId);
      if (!orderItem) throw new BadRequestException('Item does not belong to this order.');
      const alreadyRequested = inFlightByItem.get(item.orderItemId) ?? 0;
      if (item.quantity + alreadyRequested > orderItem.quantity) {
        throw new BadRequestException(
          `Cannot return more units of ${orderItem.name} than were purchased.`,
        );
      }
    }

    const rmaNumber = await this.nextRmaNumber();
    const request = await this.prisma.$transaction(async (tx) => {
      const request = await tx.returnRequest.create({
        data: {
          rmaNumber,
          orderId: order.id,
          userId,
          reason: input.reason,
          customerNote: input.customerNote,
          items: {
            create: input.items.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
              reason: item.reason,
            })),
          },
        },
        include: RETURN_INCLUDE,
      });
      if (order.status !== 'RETURN_REQUESTED') {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'RETURN_REQUESTED', version: { increment: 1 } },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'RETURN_REQUESTED',
            note: `Return ${rmaNumber} requested`,
          },
        });
      }
      return request;
    });

    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'return-status',
      to: order.email,
      data: { rmaNumber, status: 'REQUESTED', orderId: order.id },
    });
    return this.toDto(request);
  }

  async listForCustomer(userId: string): Promise<ReturnRequestDto[]> {
    const requests = await this.prisma.returnRequest.findMany({
      where: { userId },
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toDto(r));
  }

  // --- Admin side -----------------------------------------------------------

  async listAll(status?: string): Promise<ReturnRequestDto[]> {
    const requests = await this.prisma.returnRequest.findMany({
      where: status ? { status: status as never } : undefined,
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return requests.map((r) => this.toDto(r));
  }

  async getById(id: string): Promise<ReturnRequestDto> {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: RETURN_INCLUDE,
    });
    if (!request) throw new NotFoundException('Return request not found');
    return this.toDto(request);
  }

  async decide(
    id: string,
    input: ReturnDecisionInput,
    actor: { userId: string; email: string },
  ): Promise<ReturnRequestDto> {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!request) throw new NotFoundException('Return request not found');
    assertTransition('return', RETURN_TRANSITIONS, request.status, input.decision);

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: input.decision,
        internalNote: input.internalNote ?? request.internalNote,
      },
      include: RETURN_INCLUDE,
    });

    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: `return.${input.decision.toLowerCase()}`,
      entityType: 'ReturnRequest',
      entityId: id,
      reason: input.internalNote ?? undefined,
    });
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'return-status',
      to: request.order.email,
      data: { rmaNumber: request.rmaNumber, status: input.decision, orderId: request.orderId },
    });
    return this.toDto(updated);
  }

  /**
   * Record received items, their condition, and optionally restock.
   * Returned units re-enter available inventory ONLY when explicitly marked
   * RESELLABLE with restock=true (spec rule).
   */
  async receiveItems(
    id: string,
    input: ReceiveReturnItemsInput,
    actor: { userId: string; email: string },
  ): Promise<ReturnRequestDto> {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } }, order: true },
    });
    if (!request) throw new NotFoundException('Return request not found');
    assertTransition('return', RETURN_TRANSITIONS, request.status, 'RECEIVED');

    await this.prisma.$transaction(async (tx) => {
      for (const received of input.items) {
        const item = request.items.find((i) => i.id === received.returnItemId);
        if (!item) throw new BadRequestException('Return item not found on this request.');
        if (received.receivedQuantity > item.quantity) {
          throw new BadRequestException('Received more units than were requested.');
        }
        const restock =
          received.restock && received.condition === 'RESELLABLE' ? received.receivedQuantity : 0;

        await tx.returnItem.update({
          where: { id: item.id },
          data: {
            receivedQuantity: received.receivedQuantity,
            condition: received.condition,
            restockedQuantity: restock,
          },
        });
        await tx.orderItem.update({
          where: { id: item.orderItemId },
          data: { returnedQuantity: { increment: received.receivedQuantity } },
        });

        const variantId = item.orderItem.variantId;
        if (variantId) {
          const balance = await tx.inventoryBalance.findUnique({ where: { variantId } });
          if (balance) {
            await tx.inventoryBalance.update({
              where: { variantId },
              data: {
                returnedQuantity: { increment: received.receivedQuantity },
                onHandQuantity: restock > 0 ? { increment: restock } : undefined,
              },
            });
            if (restock > 0) {
              await tx.inventoryMovement.create({
                data: {
                  variantId,
                  type: 'RETURN_RESTOCK',
                  quantityChange: restock,
                  previousOnHand: balance.onHandQuantity,
                  newOnHand: balance.onHandQuantity + restock,
                  reason: `Return ${request.rmaNumber} restocked (resellable)`,
                  actorUserId: actor.userId,
                  returnRequestId: request.id,
                },
              });
            }
          }
        }
      }
      await tx.returnRequest.update({ where: { id }, data: { status: 'RECEIVED' } });
    });

    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'return.received',
      entityType: 'ReturnRequest',
      entityId: id,
    });
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'return-status',
      to: request.order.email,
      data: { rmaNumber: request.rmaNumber, status: 'RECEIVED', orderId: request.orderId },
    });
    return this.getById(id);
  }

  /** Close the return and roll the order status forward. */
  async complete(id: string, actor: { userId: string; email: string }): Promise<ReturnRequestDto> {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: { include: { items: true } } },
    });
    if (!request) throw new NotFoundException('Return request not found');
    assertTransition('return', RETURN_TRANSITIONS, request.status, 'COMPLETED');

    const allReturned = request.order.items.every((item) => item.returnedQuantity >= item.quantity);
    const newOrderStatus = allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';

    await this.prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({ where: { id }, data: { status: 'COMPLETED' } });
      await tx.order.update({
        where: { id: request.orderId },
        data: { status: newOrderStatus, version: { increment: 1 } },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: request.orderId,
          fromStatus: request.order.status,
          toStatus: newOrderStatus,
          note: `Return ${request.rmaNumber} completed`,
          actorUserId: actor.userId,
        },
      });
    });

    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'return-status',
      to: request.order.email,
      data: { rmaNumber: request.rmaNumber, status: 'COMPLETED', orderId: request.orderId },
    });
    return this.getById(id);
  }
}
