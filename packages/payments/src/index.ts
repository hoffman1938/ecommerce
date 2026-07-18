export * from './types';
export * from './mock-provider';
export * from './stripe-provider';

import type { PaymentProvider } from './types';
import { MockPaymentProvider } from './mock-provider';
import { StripePaymentProvider } from './stripe-provider';

export interface PaymentProviderConfig {
  provider: 'mock' | 'stripe';
  mockWebhookSecret: string;
  storefrontUrl: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}

/** Environment-driven provider selection (PAYMENT_PROVIDER=mock|stripe). */
export function createPaymentProvider(config: PaymentProviderConfig): PaymentProvider {
  if (config.provider === 'stripe') {
    if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
      throw new Error(
        'PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET',
      );
    }
    return new StripePaymentProvider({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
    });
  }
  return new MockPaymentProvider({
    webhookSecret: config.mockWebhookSecret,
    paymentPageBaseUrl: config.storefrontUrl,
  });
}
