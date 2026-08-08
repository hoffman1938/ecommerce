/**
 * Persistent state for the demo build.
 *
 * Everything the real stack keeps in PostgreSQL — accounts, sessions,
 * addresses, wishlists, orders, payments, returns and consumed stock — lives
 * here in a single localStorage record instead, so the Cloudflare Pages
 * deployment behaves like a working shop without a backend.
 *
 * SECURITY: this is not authentication. Every byte of it is client-side and
 * user-editable, and `hashPassword` is obfuscation, not a KDF — the real system
 * uses Argon2id server-side (packages/auth). Nothing here should ever be
 * reused, and the demo never handles real credentials.
 */

const STORE_KEY = 'outlet_demo_state';
const STORE_VERSION = 1;

export interface DemoUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  newsletterOptIn: boolean;
  notificationPreferences: {
    orderUpdates: boolean;
    campaignAnnouncements: boolean;
    newsletter: boolean;
  };
  createdAt: string;
}

export interface DemoAddress {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  countryCode: string;
  phone: string | null;
  type: 'SHIPPING' | 'BILLING' | 'BOTH';
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export interface DemoWishlistEntry {
  id: string;
  userId: string;
  productSlug: string;
  createdAt: string;
}

export interface DemoOrderItem {
  id: string;
  variantId: string;
  productSlug: string;
  name: string;
  sku: string;
  brandName: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  returnedQuantity: number;
}

export interface DemoOrder {
  id: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  status: string;
  currencyCode: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  shippingAddress: Omit<
    DemoAddress,
    'id' | 'userId' | 'type' | 'isDefaultShipping' | 'isDefaultBilling'
  >;
  billingAddress: Omit<
    DemoAddress,
    'id' | 'userId' | 'type' | 'isDefaultShipping' | 'isDefaultBilling'
  >;
  shippingMethod: string;
  customerNote: string | null;
  items: DemoOrderItem[];
  placedAt: string;
  paidAt: string | null;
  createdAt: string;
  shipments: Array<{
    id: string;
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  }>;
}

export interface DemoPayment {
  id: string;
  orderId: string;
  provider: string;
  status: string;
  amountMinor: number;
  refundedAmountMinor: number;
  failureReason: string | null;
  idempotencyKey: string | null;
  /**
   * Epoch ms at which a TEST-DELAYED payment should settle. Persisted rather
   * than held in memory so the confirmation survives a page reload on the
   * result screen, which is exactly where the user is waiting for it.
   */
  confirmAt: number | null;
  createdAt: string;
}

export interface DemoReturn {
  id: string;
  rmaNumber: string;
  userId: string;
  orderId: string;
  status: string;
  reason: string;
  customerNote: string | null;
  items: Array<{
    id: string;
    orderItemId: string;
    name: string;
    sku: string;
    quantity: number;
    receivedQuantity: number;
    restockedQuantity: number;
    condition: string;
    reason: string | null;
  }>;
  refunds: Array<{
    id: string;
    amountMinor: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface DemoState {
  version: number;
  users: DemoUser[];
  sessionUserId: string | null;
  addresses: DemoAddress[];
  wishlist: DemoWishlistEntry[];
  orders: DemoOrder[];
  payments: DemoPayment[];
  returns: DemoReturn[];
  /** variantId -> units consumed by paid orders, subtracted from seed stock. */
  stockConsumed: Record<string, number>;
  /** token -> userId, for the password-reset and verification links. */
  resetTokens: Record<string, string>;
  verifyTokens: Record<string, string>;
  newsletterEmails: string[];
  orderSequence: number;
}

/**
 * Deliberately weak, synchronous, and clearly not a KDF — see the file header.
 * Storing the raw password would be worse if a user reuses one, so this at
 * least avoids writing it verbatim into localStorage.
 */
export function hashPassword(email: string, password: string): string {
  const input = `${email.toLowerCase()}::${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** The seeded customer from packages/database/src/seed/users.ts. */
function seedUser(): DemoUser {
  const email = 'customer@example.local';
  return {
    id: 'user_seed_customer',
    email,
    passwordHash: hashPassword(email, 'Customer123!'),
    firstName: 'Clara',
    lastName: 'Customer',
    isEmailVerified: true,
    newsletterOptIn: true,
    notificationPreferences: {
      orderUpdates: true,
      campaignAnnouncements: true,
      newsletter: false,
    },
    createdAt: new Date('2026-01-05T10:00:00Z').toISOString(),
  };
}

function initialState(): DemoState {
  return {
    version: STORE_VERSION,
    users: [seedUser()],
    sessionUserId: null,
    addresses: [],
    wishlist: [],
    orders: [],
    payments: [],
    returns: [],
    stockConsumed: {},
    resetTokens: {},
    verifyTokens: {},
    newsletterEmails: [],
    orderSequence: 100_001,
  };
}

let memoryState: DemoState | null = null;

/**
 * During the static export there is no browser, so reads fall back to a fresh
 * in-memory state. Nothing is persisted at build time, which is correct — every
 * prerendered page must render the signed-out view.
 */
export function readState(): DemoState {
  if (typeof window === 'undefined') {
    if (!memoryState) memoryState = initialState();
    return memoryState;
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.users)) {
      return initialState();
    }
    // A previously stored state predating the seeded account still needs it.
    if (!parsed.users.some((u) => u.id === 'user_seed_customer')) {
      parsed.users.push(seedUser());
    }
    return parsed;
  } catch {
    return initialState();
  }
}

export function writeState(state: DemoState): void {
  if (typeof window === 'undefined') {
    memoryState = state;
    return;
  }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable or full — the session simply will not persist.
  }
}

/** Read, mutate, persist, and return whatever the mutation produced. */
export function mutate<T>(fn: (state: DemoState) => T): T {
  const state = readState();
  const result = fn(state);
  writeState(state);
  return result;
}

/**
 * Units of a variant consumed by paid orders. Lives here rather than in
 * orders.ts so the catalog queries can subtract it without importing the order
 * module, which would close an import cycle (orders -> cart -> queries).
 */
export function consumedFor(variantId: string): number {
  return readState().stockConsumed[variantId] ?? 0;
}

export function currentUser(state: DemoState = readState()): DemoUser | null {
  if (!state.sessionUserId) return null;
  return state.users.find((u) => u.id === state.sessionUserId) ?? null;
}

/** Error carrying an HTTP status so the api shim can mimic real failures. */
export class DemoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'DemoApiError';
  }
}

export function requireUser(state: DemoState = readState()): DemoUser {
  const user = currentUser(state);
  if (!user) throw new DemoApiError(401, 'You need to be signed in to do that.');
  return user;
}
