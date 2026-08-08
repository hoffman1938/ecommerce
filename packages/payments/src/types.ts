/** Provider-agnostic payment contracts. */

export interface CreatePaymentInput {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currencyCode: string;
  customerEmail: string;
  /** Absolute URL the provider should send the customer back to. */
  returnUrl: string;
  /** Absolute URL the provider should POST webhook events to. */
  webhookUrl: string;
  idempotencyKey: string;
}

export interface PaymentSession {
  provider: string;
  providerPaymentId: string;
  /** URL the browser must visit to complete payment. */
  redirectUrl: string;
}

export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.processing'
  | 'refund.succeeded'
  | 'refund.failed';

export interface VerifiedPaymentEvent {
  provider: string;
  /** Provider-unique event id used for duplicate suppression. */
  providerEventId: string;
  type: PaymentEventType;
  providerPaymentId: string;
  /** Our internal payment id when the provider echoes it back. */
  paymentId?: string;
  amountMinor?: number;
  currencyCode?: string;
  failureReason?: string;
  providerRefundId?: string;
  raw: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  amountMinor: number;
  currencyCode: string;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  provider: string;
  providerRefundId: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
}

export interface CancelResult {
  provider: string;
  cancelled: boolean;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>;
  /**
   * Verify a raw webhook request (signature + payload) and normalize it.
   * Throws WebhookVerificationError when the signature is invalid.
   */
  verifyWebhook(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
  ): Promise<VerifiedPaymentEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  cancel(providerPaymentId: string): Promise<CancelResult>;
}
