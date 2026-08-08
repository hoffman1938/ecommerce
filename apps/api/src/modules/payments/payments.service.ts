import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppConfig } from '@outlet/config';
import { Prisma } from '@outlet/database';
import {
  assertTransition,
  canTransition,
  maxRefundableMinor,
  PAYMENT_TRANSITIONS,
} from '@outlet/domain';
import {
  MockPaymentProvider,
  type PaymentProvider,
  type VerifiedPaymentEvent,
  type MockOutcome,
} from '@outlet/payments';
import { QUEUE_NAMES, JOB_NAMES, type QueueClient } from '@outlet/queue';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { APP_CONFIG, PAYMENT_PROVIDER, QUEUE_CLIENT } from '../../common/tokens';
import { ReservationsService } from '../reservations/reservations.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /** Verify a raw webhook request and process the event exactly once. */
  async handleWebhookRequest(
    providerName: string,
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Promise<{ received: boolean; duplicate: boolean }> {
    if (providerName !== this.provider.name) {
      throw new BadRequestException(`Provider ${providerName} is not active.`);
    }
    const event = await this.provider.verifyWebhook(rawBody, signature);
    return this.processEvent(event);
  }

  /**
   * Exactly-once processing: the (provider, providerEventId) unique
   * constraint on payment_events suppresses duplicate deliveries.
   */
  async processEvent(
    event: VerifiedPaymentEvent,
  ): Promise<{ received: boolean; duplicate: boolean }> {
    try {
      await this.prisma.paymentEvent.create({
        data: {
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
          payload: event.raw as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.paymentEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider: event.provider,
              providerEventId: event.providerEventId,
            },
          },
        });
        if (existing?.processedAt) {
          return { received: true, duplicate: true };
        }
        // First attempt crashed mid-processing: fall through and reprocess
        // (all downstream handlers are idempotent).
      } else {
        throw err;
      }
    }

    const payment = await this.findPayment(event);
    if (payment) {
      await this.prisma.paymentEvent.updateMany({
        where: { provider: event.provider, providerEventId: event.providerEventId },
        data: { paymentId: payment.id },
      });
    }

    switch (event.type) {
      case 'payment.succeeded':
        if (payment) await this.onPaymentSucceeded(payment.id, event);
        break;
      case 'payment.failed':
        if (payment) await this.onPaymentFailedOrCancelled(payment.id, 'FAILED', event);
        break;
      case 'payment.cancelled':
        if (payment) await this.onPaymentFailedOrCancelled(payment.id, 'CANCELLED', event);
        break;
      case 'payment.processing':
        if (payment && canTransition(PAYMENT_TRANSITIONS, payment.status, 'PROCESSING')) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'PROCESSING' },
          });
        }
        break;
      case 'refund.succeeded':
      case 'refund.failed':
        await this.onRefundEvent(event);
        break;
    }

    await this.prisma.paymentEvent.updateMany({
      where: { provider: event.provider, providerEventId: event.providerEventId },
      data: { processedAt: new Date() },
    });
    return { received: true, duplicate: false };
  }

  private async findPayment(event: VerifiedPaymentEvent) {
    if (event.paymentId) {
      const byId = await this.prisma.payment.findUnique({ where: { id: event.paymentId } });
      if (byId) return byId;
    }
    if (event.providerPaymentId) {
      return this.prisma.payment.findFirst({
        where: { provider: event.provider, providerPaymentId: event.providerPaymentId },
      });
    }
    return null;
  }

  /**
   * Success path. Never trusts a frontend redirect — only this verified
   * webhook marks anything paid. Handles the late-payment policy: if
   * reservations expired and stock cannot be re-acquired atomically, the
   * order is NOT fulfilled (no overselling); the payment is auto-refunded
   * and the order cancelled with a clear reason.
   */
  private async onPaymentSucceeded(paymentId: string, event: VerifiedPaymentEvent): Promise<void> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { order: { include: { items: true } } },
    });
    if (payment.status === 'PAID') return; // idempotent replay
    if (!canTransition(PAYMENT_TRANSITIONS, payment.status, 'PAID')) {
      // e.g. success arriving after cancellation — record, never resurrect.
      await this.audit.log({
        actorType: 'SYSTEM',
        action: 'payment.late_success_ignored',
        entityType: 'Payment',
        entityId: payment.id,
        reason: `Event ${event.providerEventId} arrived in status ${payment.status}`,
      });
      return;
    }
    if (event.amountMinor != null && event.amountMinor !== payment.amountMinor) {
      throw new ConflictException('Webhook amount does not match the payment amount.');
    }

    const order = payment.order;
    let stockSecured = false;
    await this.prisma
      .$transaction(async (tx) => {
        const result = await this.reservations.convertReservationsToSale(
          tx,
          order.id,
          order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        );
        stockSecured = result.ok;
        if (!result.ok) {
          // Roll back any partial conversion; handled outside the transaction.
          throw new StockLostError();
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID' },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID', paidAt: new Date(), version: { increment: 1 } },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: 'PAID' },
        });
        if (order.couponId) {
          await tx.coupon.update({
            where: { id: order.couponId },
            data: { timesRedeemed: { increment: 1 } },
          });
        }
        // The purchase is final: the originating cart is consumed.
        await tx.cart.updateMany({
          where: { reservations: { some: { orderId: order.id } }, status: 'ACTIVE' },
          data: { status: 'CONVERTED' },
        });
      })
      .catch(async (err) => {
        if (err instanceof StockLostError) {
          await this.handleStockLostAfterPayment(payment.id);
          return;
        }
        throw err;
      });

    if (stockSecured) {
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

  /** Late-payment safety valve: refund in full, cancel, release, notify. */
  private async handleStockLostAfterPayment(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { order: true },
    });
    const refundResult = await this.provider.refund({
      providerPaymentId: payment.providerPaymentId ?? '',
      amountMinor: payment.amountMinor,
      currencyCode: payment.currencyCode,
      reason: 'Reservation expired before payment completed; stock no longer available',
      idempotencyKey: `stock-lost-${payment.id}`,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAmountMinor: payment.amountMinor },
      });
      await tx.refund.create({
        data: {
          orderId: payment.orderId,
          paymentId: payment.id,
          amountMinor: payment.amountMinor,
          status: refundResult.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
          providerRefundId: refundResult.providerRefundId,
          reason: 'Automatic refund: stock was no longer available when payment completed.',
        },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          internalNote:
            'Payment completed after reservation expiry and stock could not be re-acquired. Automatically refunded in full.',
          version: { increment: 1 },
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: payment.orderId,
          toStatus: 'CANCELLED',
          note: 'Auto-cancelled: stock lost after late payment. Full refund issued.',
        },
      });
    });
    await this.reservations.releaseOrderReservations(payment.orderId, 'Order auto-cancelled');
    await this.audit.log({
      actorType: 'SYSTEM',
      action: 'payment.stock_lost_auto_refund',
      entityType: 'Order',
      entityId: payment.orderId,
      reason: 'No overselling: stock could not be secured after late payment success.',
    });
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'refund-confirmation',
      to: payment.order.email,
      data: {
        orderNumber: payment.order.orderNumber,
        amountMinor: payment.amountMinor,
        currencyCode: payment.currencyCode,
      },
    });
  }

  private async onPaymentFailedOrCancelled(
    paymentId: string,
    status: 'FAILED' | 'CANCELLED',
    event: VerifiedPaymentEvent,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { order: true },
    });
    if (payment.status === status) return; // idempotent replay
    if (!canTransition(PAYMENT_TRANSITIONS, payment.status, status)) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status, failureReason: event.failureReason ?? null },
    });
    // Give the customer their remaining reservation window to retry: holds
    // return to ACTIVE with the ORIGINAL expiry (never extended).
    await this.prisma.inventoryReservation.updateMany({
      where: {
        orderId: payment.orderId,
        status: 'PAYMENT_PROCESSING',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'ACTIVE' },
    });

    if (status === 'FAILED') {
      await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
        kind: 'payment-failed',
        to: payment.order.email,
        data: { orderNumber: payment.order.orderNumber, orderId: payment.orderId },
      });
    }
  }

  private async onRefundEvent(event: VerifiedPaymentEvent): Promise<void> {
    if (!event.providerRefundId) return;
    const refund = await this.prisma.refund.findFirst({
      where: { providerRefundId: event.providerRefundId },
    });
    if (!refund) return;
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: event.type === 'refund.succeeded' ? 'SUCCEEDED' : 'FAILED' },
    });
  }

  // --- Local mock payment controls ----------------------------------------

  /**
   * Local test control: generates a signed webhook for the chosen outcome and
   * runs it through the normal verification path. Stable event ids mean
   * repeated clicks exercise duplicate-webhook suppression for real.
   */
  async simulateMockOutcome(
    paymentId: string,
    outcome: MockOutcome,
  ): Promise<{ processed: boolean; duplicate: boolean; delayed?: boolean }> {
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new BadRequestException('Mock payment simulation requires PAYMENT_PROVIDER=mock.');
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    if (outcome === 'TEST-DELAYED') {
      // Immediate "processing" event, then success delivered by the worker.
      const processing = this.provider.buildWebhookEvent({
        outcome: 'TEST-DELAYED',
        paymentId,
        amountMinor: payment.amountMinor,
        currencyCode: payment.currencyCode,
        eventId: `mockevt_${paymentId}_processing`,
      });
      const raw = JSON.stringify(processing);
      const result = await this.handleWebhookRequest('mock', raw, this.provider.signPayload(raw));
      await this.queue.enqueue(
        QUEUE_NAMES.payments,
        JOB_NAMES.processDelayedPayment,
        { paymentId },
        { delayMs: 10_000, jobId: `delayed:${paymentId}` },
      );
      return { processed: result.received, duplicate: result.duplicate, delayed: true };
    }

    const eventPayload = this.provider.buildWebhookEvent({
      outcome,
      paymentId,
      amountMinor: payment.amountMinor,
      currencyCode: payment.currencyCode,
      eventId: `mockevt_${paymentId}_${outcome}`,
    });
    const raw = JSON.stringify(eventPayload);
    const result = await this.handleWebhookRequest('mock', raw, this.provider.signPayload(raw));
    return { processed: result.received, duplicate: result.duplicate };
  }

  // --- Refunds (admin + returns flow) --------------------------------------

  async createRefund(
    input: {
      orderId: string;
      amountMinor: number;
      reason: string;
      returnRequestId?: string | null;
    },
    actor: { userId: string; email: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: { payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const payment = order.payments[0];
    if (!payment) throw new BadRequestException('Order has no refundable payment.');

    const refundable = maxRefundableMinor(payment.amountMinor, payment.refundedAmountMinor);
    if (input.amountMinor > refundable) {
      throw new BadRequestException(
        `Refund exceeds the refundable remainder (${refundable} minor units).`,
      );
    }

    const idempotencyKey = `refund-${payment.id}-${payment.refundedAmountMinor + input.amountMinor}`;
    const result = await this.provider.refund({
      providerPaymentId: payment.providerPaymentId ?? '',
      amountMinor: input.amountMinor,
      currencyCode: payment.currencyCode,
      reason: input.reason,
      idempotencyKey,
    });

    const newRefundedTotal = payment.refundedAmountMinor + input.amountMinor;
    const newStatus = newRefundedTotal >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    assertTransition('payment', PAYMENT_TRANSITIONS, payment.status, newStatus);

    const refund = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          returnRequestId: input.returnRequestId ?? null,
          amountMinor: input.amountMinor,
          status: result.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
          providerRefundId: result.providerRefundId,
          reason: input.reason,
          createdByUserId: actor.userId,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundedAmountMinor: newRefundedTotal, status: newStatus },
      });
      return refund;
    });

    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'refund.created',
      entityType: 'Refund',
      entityId: refund.id,
      after: { amountMinor: input.amountMinor, orderId: order.id },
      reason: input.reason,
    });
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, {
      kind: 'refund-confirmation',
      to: order.email,
      data: {
        orderNumber: order.orderNumber,
        amountMinor: input.amountMinor,
        currencyCode: order.currencyCode,
      },
    });
    return refund;
  }
}

class StockLostError extends Error {
  constructor() {
    super('STOCK_LOST');
  }
}
