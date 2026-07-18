import { reservationExpiry, isReservationExpired, secondsRemaining } from './reservation';

describe('reservation expiry', () => {
  const start = new Date('2026-07-18T12:00:00Z');

  it('defaults to 20 minutes', () => {
    expect(reservationExpiry(start, 20).toISOString()).toBe('2026-07-18T12:20:00.000Z');
  });

  it('supports configurable durations', () => {
    expect(reservationExpiry(start, 5).toISOString()).toBe('2026-07-18T12:05:00.000Z');
  });

  it('falls back to the default for invalid durations', () => {
    expect(reservationExpiry(start, 0).toISOString()).toBe('2026-07-18T12:20:00.000Z');
    expect(reservationExpiry(start, -5).toISOString()).toBe('2026-07-18T12:20:00.000Z');
    expect(reservationExpiry(start, NaN).toISOString()).toBe('2026-07-18T12:20:00.000Z');
  });

  it('detects expiration against a reference clock', () => {
    const expiry = reservationExpiry(start, 20);
    expect(isReservationExpired(expiry, new Date('2026-07-18T12:19:59Z'))).toBe(false);
    expect(isReservationExpired(expiry, new Date('2026-07-18T12:20:00Z'))).toBe(true);
    expect(isReservationExpired(expiry, new Date('2026-07-18T12:21:00Z'))).toBe(true);
  });

  it('reports remaining seconds and never goes negative', () => {
    const expiry = reservationExpiry(start, 20);
    expect(secondsRemaining(expiry, start)).toBe(1200);
    expect(secondsRemaining(expiry, new Date('2026-07-18T12:30:00Z'))).toBe(0);
  });
});
