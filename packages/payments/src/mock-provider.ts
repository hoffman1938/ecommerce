import * as crypto from 'node:crypto';
import {
  type CancelResult,
  type CreatePaymentInput,
  type PaymentProvider,
  type PaymentSession,
  type RefundInput,
  type RefundResult,
  type VerifiedPaymentEvent,
  type PaymentEventType,
  WebhookVerificationError,
} from './types';

/**
 * Outcomes the mock payment page can trigger. Everything other than SUCCESS,
 * DELAYED and CANCEL is a failure variant that differs only in the reason the
 * customer is shown.
 */
export type MockOutcome =
  | 'TEST-SUCCESS'
  | 'TEST-DELAYED'
  | 'TEST-CANCEL'
  | 'TEST-FAIL'
  | 'TEST-DECLINED'
  | 'TEST-INSUFFICIENT-FUNDS'
  | 'TEST-EXPIRED-CARD'
  | 'TEST-INVALID-CARD'
  | 'TEST-3DS-FAILED'
  | 'TEST-PROVIDER-UNAVAILABLE'
  | 'TEST-TIMEOUT';

const FAILURE_REASONS: Partial<Record<MockOutcome, string>> = {
  'TEST-FAIL': 'Card declined (local test)',
  'TEST-DECLINED': 'Card declined by issuer (local test)',
  'TEST-INSUFFICIENT-FUNDS': 'Insufficient funds (local test)',
  'TEST-EXPIRED-CARD': 'Card expired (local test)',
  'TEST-INVALID-CARD': 'Invalid card details (local test)',
  'TEST-3DS-FAILED': '3-D Secure authentication failed (local test)',
  'TEST-PROVIDER-UNAVAILABLE': 'Provider unavailable (local test)',
  'TEST-TIMEOUT': 'Provider timed out (local test)',
};

export interface MockWebhookPayload {
  eventId: string;
  type: PaymentEventType;
  providerPaymentId: string;
  paymentId: string;
  amountMinor: number;
  currencyCode: string;
  failureReason?: string;
  providerRefundId?: string;
  createdAt: string;
}

/**
 * Fully local payment provider. The checkout redirects the browser to a
 * local "payment page" (hosted by the storefront) where the tester chooses an
 * outcome (see MockOutcome). That page
 * calls the API's simulate endpoint, which uses `buildWebhookEvent` +
 * `signPayload` to produce an HMAC-signed webhook — exercising the exact same
 * verification and processing path a real provider would use, including
 * duplicate-delivery testing.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(
    private readonly options: {
      webhookSecret: string;
      /** Storefront base URL hosting the mock payment page. */
      paymentPageBaseUrl: string;
    },
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const providerPaymentId = `mockpay_${input.paymentId}`;
    const redirectUrl = `${this.options.paymentPageBaseUrl.replace(/\/$/, '')}/checkout/mock-payment?paymentId=${encodeURIComponent(
      input.paymentId,
    )}&amount=${input.amountMinor}&currency=${encodeURIComponent(input.currencyCode)}&orderNumber=${encodeURIComponent(
      input.orderNumber,
    )}&returnUrl=${encodeURIComponent(input.returnUrl)}`;
    return { provider: this.name, providerPaymentId, redirectUrl };
  }

  signPayload(rawBody: string): string {
    return crypto.createHmac('sha256', this.options.webhookSecret).update(rawBody).digest('hex');
  }

  buildWebhookEvent(args: {
    outcome: MockOutcome | 'REFUND-SUCCESS';
    paymentId: string;
    amountMinor: number;
    currencyCode: string;
    /** Stable id makes duplicate-delivery simulation trivial. */
    eventId?: string;
  }): MockWebhookPayload {
    const typeByOutcome: Record<string, PaymentEventType> = {
      'TEST-SUCCESS': 'payment.succeeded',
      'TEST-CANCEL': 'payment.cancelled',
      'TEST-DELAYED': 'payment.processing',
      'REFUND-SUCCESS': 'refund.succeeded',
      // Every failure variant lands on the same event type.
      ...Object.fromEntries(
        Object.keys(FAILURE_REASONS).map((code) => [code, 'payment.failed' as PaymentEventType]),
      ),
    };
    return {
      eventId: args.eventId ?? `mockevt_${crypto.randomUUID()}`,
      type: typeByOutcome[args.outcome],
      providerPaymentId: `mockpay_${args.paymentId}`,
      paymentId: args.paymentId,
      amountMinor: args.amountMinor,
      currencyCode: args.currencyCode,
      failureReason: FAILURE_REASONS[args.outcome as MockOutcome],
      providerRefundId:
        args.outcome === 'REFUND-SUCCESS' ? `mockref_${crypto.randomUUID()}` : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  async verifyWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
  ): Promise<VerifiedPaymentEvent> {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    if (!signatureHeader) {
      throw new WebhookVerificationError('Missing mock webhook signature header');
    }
    const expected = this.signPayload(body);
    const provided = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
      throw new WebhookVerificationError('Invalid mock webhook signature');
    }
    let payload: MockWebhookPayload;
    try {
      payload = JSON.parse(body) as MockWebhookPayload;
    } catch {
      throw new WebhookVerificationError('Mock webhook payload is not valid JSON');
    }
    if (!payload.eventId || !payload.type || !payload.paymentId) {
      throw new WebhookVerificationError('Mock webhook payload is missing required fields');
    }
    return {
      provider: this.name,
      providerEventId: payload.eventId,
      type: payload.type,
      providerPaymentId: payload.providerPaymentId,
      paymentId: payload.paymentId,
      amountMinor: payload.amountMinor,
      currencyCode: payload.currencyCode,
      failureReason: payload.failureReason,
      providerRefundId: payload.providerRefundId,
      raw: payload,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Local refunds always succeed immediately.
    return {
      provider: this.name,
      providerRefundId: `mockref_${crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`,
      status: 'SUCCEEDED',
    };
  }

  async cancel(_providerPaymentId: string): Promise<CancelResult> {
    return { provider: this.name, cancelled: true };
  }
}
