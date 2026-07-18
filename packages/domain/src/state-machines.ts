import type {
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  ReturnStatus,
} from '@outlet/types';

/**
 * Explicit state machines. Every status change in the API goes through
 * `assertTransition`, so illegal jumps (e.g. CANCELLED -> PAID) are
 * impossible regardless of which endpoint or job attempts them.
 */

type TransitionMap<S extends string> = Record<S, readonly S[]>;

export const ORDER_TRANSITIONS: TransitionMap<OrderStatus> = {
  DRAFT: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'RETURN_REQUESTED'],
  PROCESSING: ['PACKED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED', 'PARTIALLY_RETURNED', 'RETURNED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['PARTIALLY_RETURNED', 'RETURNED', 'DELIVERED', 'SHIPPED', 'PAID'],
  PARTIALLY_RETURNED: ['RETURNED', 'RETURN_REQUESTED'],
  RETURNED: [],
};

export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  PENDING: ['PROCESSING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  PROCESSING: ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PAID', 'CANCELLED', 'FAILED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
};

export const RESERVATION_TRANSITIONS: TransitionMap<ReservationStatus> = {
  ACTIVE: ['CHECKOUT_STARTED', 'PAYMENT_PROCESSING', 'CONVERTED', 'EXPIRED', 'CANCELLED'],
  CHECKOUT_STARTED: ['PAYMENT_PROCESSING', 'CONVERTED', 'EXPIRED', 'CANCELLED', 'ACTIVE'],
  PAYMENT_PROCESSING: ['CONVERTED', 'EXPIRED', 'CANCELLED', 'ACTIVE'],
  CONVERTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const RETURN_TRANSITIONS: TransitionMap<ReturnStatus> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'CANCELLED'],
  REJECTED: [],
  RECEIVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return from === to || (map[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(map, from, to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}

/** Reservation statuses that hold stock. */
export const STOCK_HOLDING_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'ACTIVE',
  'CHECKOUT_STARTED',
  'PAYMENT_PROCESSING',
];

/** Order statuses from which a customer may request a return. */
export const RETURNABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'SHIPPED',
  'DELIVERED',
  'PARTIALLY_RETURNED',
];

/** Order statuses an admin may cancel from. */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PACKED',
];
