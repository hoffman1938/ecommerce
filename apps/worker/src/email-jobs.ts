import type { AppConfig } from '@outlet/config';
import {
  orderConfirmationEmail,
  passwordResetEmail,
  paymentFailedEmail,
  refundConfirmationEmail,
  returnStatusEmail,
  shipmentEmail,
  verificationEmail,
  type EmailMessage,
  type EmailProvider,
} from '@outlet/email';
import type { EmailJobPayload } from '@outlet/queue';
import { formatMinor } from '@outlet/domain';

/** Renders and sends one queued email job. */
export async function processEmailJob(
  provider: EmailProvider,
  config: AppConfig,
  payload: EmailJobPayload,
): Promise<void> {
  const storefront = config.urls.storefront.replace(/\/$/, '');
  const data = payload.data as Record<string, unknown>;
  let message: EmailMessage;

  switch (payload.kind) {
    case 'verification':
      message = verificationEmail(payload.to, String(data.verifyUrl));
      break;
    case 'password-reset':
      message = passwordResetEmail(payload.to, String(data.resetUrl));
      break;
    case 'order-confirmation': {
      const items =
        (data.items as Array<{ name: string; quantity: number; totalMinor: number }>) ?? [];
      const currency = String(data.currencyCode ?? 'EUR');
      message = orderConfirmationEmail(payload.to, {
        orderNumber: String(data.orderNumber),
        totalFormatted: formatMinor(Number(data.totalMinor ?? 0), currency),
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          priceFormatted: formatMinor(item.totalMinor, currency),
        })),
        orderUrl: `${storefront}/account/orders/${String(data.orderId)}`,
      });
      break;
    }
    case 'payment-failed':
      message = paymentFailedEmail(
        payload.to,
        String(data.orderNumber),
        `${storefront}/checkout/result?orderId=${String(data.orderId)}`,
      );
      break;
    case 'shipment':
      message = shipmentEmail(
        payload.to,
        String(data.orderNumber),
        data.trackingNumber ? String(data.trackingNumber) : null,
        `${storefront}/account/orders/${String(data.orderId)}`,
      );
      break;
    case 'return-status':
      message = returnStatusEmail(
        payload.to,
        String(data.rmaNumber),
        String(data.status),
        `${storefront}/account/returns`,
      );
      break;
    case 'refund-confirmation':
      message = refundConfirmationEmail(
        payload.to,
        String(data.orderNumber ?? ''),
        formatMinor(Number(data.amountMinor ?? 0), String(data.currencyCode ?? 'EUR')),
      );
      break;
    default:
      throw new Error(`Unknown email kind: ${(payload as { kind: string }).kind}`);
  }
  await provider.send(message);
}
