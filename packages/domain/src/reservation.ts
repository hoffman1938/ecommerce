/**
 * Reservation policy. The server clock is authoritative; the frontend only
 * displays `expiresAt` values returned by the API.
 */

export const DEFAULT_RESERVATION_MINUTES = 20;

export function reservationExpiry(from: Date, durationMinutes: number): Date {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    durationMinutes = DEFAULT_RESERVATION_MINUTES;
  }
  return new Date(from.getTime() + Math.round(durationMinutes * 60_000));
}

export function isReservationExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function secondsRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
