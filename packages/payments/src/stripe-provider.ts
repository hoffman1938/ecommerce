import Stripe from 'stripe';
import {
  type CancelResult,
  type CreatePaymentInput,
  type PaymentProvider,
  type PaymentSession,
  type RefundInput,
  type RefundResult,
  type VerifiedPaymentEvent,
  WebhookVerificationError,
} from './types';

/**
 * Stripe adapter behind the shared PaymentProvider interface. Optional for
 * local development — selected via PAYMENT_PROVIDER=stripe with real keys.
 * Uses Stripe Checkout Sessions so no card data ever touches this backend.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    private readonly options: {
      secretKey: string;
      webhookSecret: string;
    },
  ) {
    this.stripe = new Stripe(options.secretKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: input.customerEmail,
        client_reference_id: input.paymentId,
        line_items: [
          {
            price_data: {
              currency: input.currencyCode.toLowerCase(),
              product_data: { name: `Order ${input.orderNumber}` },
              unit_amount: input.amountMinor,
            },
            quantity: 1,
          },
        ],
        metadata: { paymentId: input.paymentId, orderId: input.orderId },
        success_url: `${input.returnUrl}?status=success`,
        cancel_url: `${input.returnUrl}?status=cancelled`,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { provider: this.name, providerPaymentId: session.id, redirectUrl: session.url };
  }

  async verifyWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
  ): Promise<VerifiedPaymentEvent> {
    if (!signatureHeader) throw new WebhookVerificationError('Missing Stripe-Signature header');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        this.options.webhookSecret,
      );
    } catch (err) {
      throw new WebhookVerificationError(`Stripe signature verification failed: ${(err as Error).message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          provider: this.name,
          providerEventId: event.id,
          type: 'payment.succeeded',
          providerPaymentId: session.id,
          paymentId: session.metadata?.paymentId ?? session.client_reference_id ?? undefined,
          amountMinor: session.amount_total ?? undefined,
          currencyCode: session.currency?.toUpperCase(),
          raw: event,
        };
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          provider: this.name,
          providerEventId: event.id,
          type: 'payment.cancelled',
          providerPaymentId: session.id,
          paymentId: session.metadata?.paymentId ?? undefined,
          raw: event,
        };
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        return {
          provider: this.name,
          providerEventId: event.id,
          type: 'refund.succeeded',
          providerPaymentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.id,
          amountMinor: charge.amount_refunded,
          currencyCode: charge.currency?.toUpperCase(),
          raw: event,
        };
      }
      default:
        return {
          provider: this.name,
          providerEventId: event.id,
          type: 'payment.processing',
          providerPaymentId: '',
          raw: event,
        };
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // providerPaymentId is a Checkout Session id; resolve its PaymentIntent.
    const session = await this.stripe.checkout.sessions.retrieve(input.providerPaymentId);
    const paymentIntent =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent) throw new Error('No payment intent found for session');
    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntent, amount: input.amountMinor },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      provider: this.name,
      providerRefundId: refund.id,
      status: refund.status === 'succeeded' ? 'SUCCEEDED' : refund.status === 'failed' ? 'FAILED' : 'PENDING',
    };
  }

  async cancel(providerPaymentId: string): Promise<CancelResult> {
    try {
      await this.stripe.checkout.sessions.expire(providerPaymentId);
      return { provider: this.name, cancelled: true };
    } catch {
      return { provider: this.name, cancelled: false };
    }
  }
}
