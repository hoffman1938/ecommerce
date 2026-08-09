/** Client-safe formatting helpers shared by storefront and admin. */

export function formatMoney(amountMinor: number, currencyCode = 'EUR', locale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 100);
}

export function formatDate(iso: string | Date, locale = 'en'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * A countdown, at the resolution the remaining time deserves.
 *
 * A cart reservation has minutes left and wants `04:32`. A campaign has days
 * left, and rendering that the same way produced `7199:40` — technically the
 * minutes remaining, and unreadable as anything. Anything over an hour steps up
 * to days and hours, which is how long a wait is actually described.
 */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));

  if (clamped >= 3600) {
    const days = Math.floor(clamped / 86_400);
    const hours = Math.floor((clamped % 86_400) / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
