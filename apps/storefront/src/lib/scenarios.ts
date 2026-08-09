/**
 * Predefined QA scenarios.
 *
 * These are written instructions rather than one-click macros on purpose: the
 * point of a scenario is that a tester walks the *real* UI and sees what a
 * customer would. A button that fabricated the end state directly would prove
 * nothing about the journey.
 *
 * Where a step is genuinely unreachable by hand — advancing fulfilment, forcing
 * a delivery failure — the scenario points at the control that does it.
 */

export interface Scenario {
  id: string;
  title: string;
  goal: string;
  steps: string[];
  /** Where the tester should begin, when there is an obvious entry point. */
  startHref?: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'successful-purchase',
    title: '1 · Successful purchase',
    goal: 'Browse to delivered, with every notification and tracking scan along the way.',
    startHref: '/products',
    steps: [
      'Open a product, pick a size, add it to the bag.',
      'Go to checkout, fill the form, continue to payment.',
      'Pay with the 4242 4242 4242 4242 test card.',
      'Open the order, then use “Jump to stage → DELIVERED” above.',
      'Check the order timeline, tracking scans, notifications and inbox.',
    ],
  },
  {
    id: 'failed-payment',
    title: '2 · Failed payment, then retry',
    goal: 'A decline keeps the order recoverable rather than losing the basket.',
    startHref: '/products',
    steps: [
      'Add an item and reach the payment page.',
      'Pay with 4000 0000 0000 0002 — the payment is declined and you stay on the page.',
      'Confirm the decline message names the reason.',
      'Retry with 4242 4242 4242 4242 and confirm the same order completes.',
    ],
  },
  {
    id: 'out-of-stock',
    title: '3 · Item sells out mid-session',
    goal: 'Checkout must refuse an order it can no longer fulfil.',
    startHref: '/products',
    steps: [
      'Add an item to the bag but do not check out.',
      'In Inventory above, set that variant’s availability to 0.',
      'Return to the bag and try to increase the quantity.',
      'Confirm the error names the shortfall rather than failing silently.',
    ],
  },
  {
    id: 'cancellation',
    title: '4 · Cancellation restores stock',
    goal: 'Cancelling before shipment returns the units to the catalogue.',
    steps: [
      'Note a variant’s availability in Inventory above.',
      'Buy one unit of it and let the payment succeed.',
      'Confirm availability dropped by one.',
      'Open the order and press “Cancel this order”.',
      'Confirm availability is restored and the timeline shows the cancellation.',
    ],
  },
  {
    id: 'return-and-refund',
    title: '5 · Return and refund',
    goal: 'The full post-delivery path, which normally needs days of waiting.',
    steps: [
      'Complete a purchase and jump the order to DELIVERED.',
      'Open the order and request a return for one item.',
      'Follow the return from /account/returns.',
      'Confirm the refund appears against the original payment.',
    ],
    startHref: '/account/orders',
  },
  {
    id: 'failed-delivery',
    title: '6 · Failed delivery, then retry',
    goal: 'A missed delivery should show on tracking, not vanish.',
    steps: [
      'Complete a purchase and jump the order to SHIPPED.',
      'Press “Fail delivery” on that order above.',
      'Open the order and confirm tracking shows the failed attempt and the retry.',
      'Jump to DELIVERED and confirm the timeline completes.',
    ],
  },
  {
    id: 'promo-codes',
    title: '7 · Promo code validation',
    goal: 'Invalid and under-minimum codes must be rejected with a clear reason.',
    startHref: '/cart',
    steps: [
      'Add a single low-priced item to the bag.',
      'Apply SAVE20 — it is rejected below the €100 minimum.',
      'Apply NOTACODE — it is rejected as unknown.',
      'Apply WELCOME10 and confirm the discount and totals update.',
    ],
  },
  {
    id: 'reservation-expiry',
    title: '8 · Reservation expiry',
    goal: 'A held item is released when the countdown runs out.',
    startHref: '/cart',
    steps: [
      'Add an item and note the 20-minute countdown in the bag.',
      'Use “+1 hour” in Time above.',
      'Reload the bag and confirm the reservation is reported as expired.',
      'Confirm checkout refuses to proceed until the item is re-added.',
    ],
  },
];
