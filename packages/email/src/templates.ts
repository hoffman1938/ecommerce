import type { EmailMessage } from './provider';

/**
 * Plain, dependency-free email templates. Every customer-facing flow has a
 * template so all flows are inspectable in Mailpit locally.
 */

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; margin:0; padding:24px;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:8px; padding:32px;">
      <h2 style="margin-top:0; color:#111827;">Outlet Marketplace</h2>
      <h3 style="color:#111827;">${title}</h3>
      ${bodyHtml}
      <p style="color:#6b7280; font-size:12px; margin-top:32px;">
        This is a local development email captured by Mailpit.
      </p>
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p><a href="${url}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 20px; border-radius:6px; text-decoration:none;">${label}</a></p>
<p style="color:#6b7280; font-size:13px;">Or open this link: <br/>${url}</p>`;
}

export function verificationEmail(to: string, verifyUrl: string): EmailMessage {
  return {
    to,
    subject: 'Verify your email address',
    text: `Welcome to Outlet Marketplace!\n\nPlease verify your email address by opening:\n${verifyUrl}\n\nThe link is valid for 24 hours.`,
    html: layout(
      'Verify your email address',
      `<p>Welcome! Please confirm your email address to activate your account.</p>${button(verifyUrl, 'Verify email')}<p style="color:#6b7280; font-size:13px;">The link is valid for 24 hours.</p>`,
    ),
  };
}

export function passwordResetEmail(to: string, resetUrl: string): EmailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: `We received a request to reset your password.\n\nOpen this link to choose a new password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email. The link is valid for 1 hour.`,
    html: layout(
      'Reset your password',
      `<p>We received a request to reset your password.</p>${button(resetUrl, 'Choose a new password')}<p style="color:#6b7280; font-size:13px;">If you did not request this, ignore this email. The link is valid for 1 hour.</p>`,
    ),
  };
}

export interface OrderEmailData {
  orderNumber: string;
  totalFormatted: string;
  items: Array<{ name: string; quantity: number; priceFormatted: string }>;
  orderUrl: string;
}

function itemsTable(items: OrderEmailData['items']): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;">${i.name} × ${i.quantity}</td><td style="text-align:right;">${i.priceFormatted}</td></tr>`,
    )
    .join('');
  return `<table style="width:100%; border-collapse:collapse; margin:16px 0;">${rows}</table>`;
}

export function orderConfirmationEmail(to: string, data: OrderEmailData): EmailMessage {
  return {
    to,
    subject: `Order confirmed — ${data.orderNumber}`,
    text: `Thank you for your order ${data.orderNumber}.\nTotal: ${data.totalFormatted}\n\nView your order: ${data.orderUrl}`,
    html: layout(
      `Order ${data.orderNumber} confirmed`,
      `<p>Thank you for your purchase! Your payment was received.</p>${itemsTable(data.items)}<p><strong>Total: ${data.totalFormatted}</strong></p>${button(data.orderUrl, 'View your order')}`,
    ),
  };
}

export function paymentFailedEmail(
  to: string,
  orderNumber: string,
  retryUrl: string,
): EmailMessage {
  return {
    to,
    subject: `Payment failed for order ${orderNumber}`,
    text: `Unfortunately the payment for order ${orderNumber} failed. Your items are only reserved for a limited time.\n\nTry again: ${retryUrl}`,
    html: layout(
      'Payment failed',
      `<p>Unfortunately the payment for order <strong>${orderNumber}</strong> failed. Your items are only reserved for a limited time.</p>${button(retryUrl, 'Try again')}`,
    ),
  };
}

export function shipmentEmail(
  to: string,
  orderNumber: string,
  trackingNumber: string | null,
  orderUrl: string,
): EmailMessage {
  const tracking = trackingNumber ? `Tracking number: ${trackingNumber}` : '';
  return {
    to,
    subject: `Your order ${orderNumber} has shipped`,
    text: `Good news — order ${orderNumber} is on its way. ${tracking}\n\nTrack it here: ${orderUrl}`,
    html: layout(
      'Your order has shipped',
      `<p>Good news — order <strong>${orderNumber}</strong> is on its way.</p>${trackingNumber ? `<p>Tracking number: <strong>${trackingNumber}</strong></p>` : ''}${button(orderUrl, 'Track your order')}`,
    ),
  };
}

export function returnStatusEmail(
  to: string,
  rmaNumber: string,
  status: string,
  detailsUrl: string,
): EmailMessage {
  return {
    to,
    subject: `Return ${rmaNumber}: ${status}`,
    text: `Your return request ${rmaNumber} is now: ${status}.\n\nDetails: ${detailsUrl}`,
    html: layout(
      `Return ${rmaNumber} update`,
      `<p>Your return request <strong>${rmaNumber}</strong> is now: <strong>${status}</strong>.</p>${button(detailsUrl, 'View return details')}`,
    ),
  };
}

export function refundConfirmationEmail(
  to: string,
  orderNumber: string,
  amountFormatted: string,
): EmailMessage {
  return {
    to,
    subject: `Refund issued for order ${orderNumber}`,
    text: `A refund of ${amountFormatted} for order ${orderNumber} has been issued to your original payment method.`,
    html: layout(
      'Refund issued',
      `<p>A refund of <strong>${amountFormatted}</strong> for order <strong>${orderNumber}</strong> has been issued to your original payment method.</p>`,
    ),
  };
}
