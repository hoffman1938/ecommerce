import {
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  RESERVATION_TRANSITIONS,
  RETURN_TRANSITIONS,
  canTransition,
  assertTransition,
  InvalidTransitionError,
} from './state-machines';

describe('order state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'AWAITING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, 'PAID', 'PROCESSING')).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, 'PROCESSING', 'SHIPPED')).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, 'SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('blocks illegal jumps', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'CANCELLED', 'PAID')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'AWAITING_PAYMENT', 'SHIPPED')).toBe(false);
    expect(() => assertTransition('order', ORDER_TRANSITIONS, 'CANCELLED', 'PAID')).toThrow(
      InvalidTransitionError,
    );
  });

  it('is idempotent for same-status updates', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'PAID', 'PAID')).toBe(true);
  });
});

describe('payment state machine', () => {
  it('never resurrects failed or refunded payments', () => {
    expect(canTransition(PAYMENT_TRANSITIONS, 'FAILED', 'PAID')).toBe(false);
    expect(canTransition(PAYMENT_TRANSITIONS, 'REFUNDED', 'PAID')).toBe(false);
    expect(canTransition(PAYMENT_TRANSITIONS, 'CANCELLED', 'PAID')).toBe(false);
  });

  it('supports partial then full refunds', () => {
    expect(canTransition(PAYMENT_TRANSITIONS, 'PAID', 'PARTIALLY_REFUNDED')).toBe(true);
    expect(canTransition(PAYMENT_TRANSITIONS, 'PARTIALLY_REFUNDED', 'REFUNDED')).toBe(true);
  });
});

describe('reservation state machine', () => {
  it('terminal states are frozen', () => {
    for (const terminal of ['CONVERTED', 'EXPIRED', 'CANCELLED'] as const) {
      expect(canTransition(RESERVATION_TRANSITIONS, terminal, 'ACTIVE')).toBe(false);
    }
  });

  it('an expired reservation can never be converted', () => {
    expect(canTransition(RESERVATION_TRANSITIONS, 'EXPIRED', 'CONVERTED')).toBe(false);
  });
});

describe('return state machine', () => {
  it('follows request -> approve -> receive -> complete', () => {
    expect(canTransition(RETURN_TRANSITIONS, 'REQUESTED', 'APPROVED')).toBe(true);
    expect(canTransition(RETURN_TRANSITIONS, 'APPROVED', 'RECEIVED')).toBe(true);
    expect(canTransition(RETURN_TRANSITIONS, 'RECEIVED', 'COMPLETED')).toBe(true);
    expect(canTransition(RETURN_TRANSITIONS, 'REJECTED', 'COMPLETED')).toBe(false);
  });
});
