/**
 * Materialised admin dataset for the static Cloudflare Pages build.
 *
 * Cloudflare Pages cannot host the NestJS API, PostgreSQL, Redis or MinIO, so
 * the demo admin expands the shared catalogue spec (@outlet/catalog — the same
 * one the Prisma seed writes to Postgres) into the record shapes the panel's
 * screens expect: products with variants and images, plus deterministic
 * customers, orders and reviews to moderate.
 *
 * Product data itself is *not* defined here. Change packages/catalog to change
 * the shop, and the seeded database, the storefront demo and this all move
 * together.
 *
 * Everything is derived from a fixed epoch and an integer hash rather than
 * Math.random, so two visitors comparing screens see identical numbers.
 */

import {
  BRANDS,
  CAMPAIGNS,
  CATALOG_EPOCH,
  CATEGORIES,
  CONTENT_PAGES,
  CURRENCY_CODE,
  DEFAULT_CARE_INSTRUCTIONS,
  DEFAULT_COUNTRY_OF_ORIGIN,
  PRODUCTS,
  SETTINGS,
} from '@outlet/catalog';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse(CATALOG_EPOCH);

/**
 * Deterministic pseudo-random in [0,1) from a string key.
 *
 * FNV-1a: cheap, no dependency, and stable across browsers — which matters
 * because these numbers become stock levels and order totals that must not
 * change between two loads of the same page.
 */
function hash01(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(items: readonly T[], key: string): T {
  return items[Math.floor(hash01(key) * items.length) % items.length];
}

function intBetween(min: number, max: number, key: string): number {
  return min + Math.floor(hash01(key) * (max - min + 1));
}

// --- Reference data --------------------------------------------------------

export interface DemoBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
}

export const DEMO_BRANDS: DemoBrand[] = BRANDS.map((brand) => ({
  id: `brand_${brand.slug}`,
  name: brand.name,
  slug: brand.slug,
  logoUrl: null,
  isFeatured: brand.isFeatured,
  isActive: true,
}));

export interface DemoCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  position: number;
  isActive: boolean;
}

export const DEMO_CATEGORIES: DemoCategory[] = CATEGORIES.map((category) => ({
  id: `cat_${category.slug}`,
  name: category.name,
  slug: category.slug,
  parentId: category.parentSlug ? `cat_${category.parentSlug}` : null,
  description: null,
  position: category.position,
  isActive: true,
}));

// --- Products --------------------------------------------------------------

/** Stock plans mirror the seed's intent: some rows must read as problems. */
const STOCK_RANGE: Record<string, [number, number]> = {
  'sold-out': [0, 0],
  single: [1, 1],
  low: [1, 3],
  normal: [4, 18],
  high: [20, 60],
};

export interface DemoVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  isEnabled: boolean;
  onHand: number;
  reserved: number;
  available: number;
}

export interface DemoProduct {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  brand: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string } | null;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  countryOfOrigin: string | null;
  targetGroup: string;
  originalPriceMinor: number;
  outletPriceMinor: number;
  currencyCode: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedFrom: string | null;
  publishedUntil: string | null;
  ratingSum: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  variants: DemoVariant[];
  images: Array<{ id: string; url: string; altText: string | null; position: number }>;
}

export const DEMO_PRODUCTS: DemoProduct[] = PRODUCTS.map((spec, index) => {
  const brand = DEMO_BRANDS.find((b) => b.slug === spec.brand) ?? DEMO_BRANDS[0];
  const category = DEMO_CATEGORIES.find((c) => c.slug === spec.category) ?? null;
  const [minStock, maxStock] = STOCK_RANGE[spec.stock] ?? STOCK_RANGE.normal;

  const variants: DemoVariant[] = [];
  for (const color of spec.colors.length > 0 ? spec.colors : ['Default']) {
    for (const size of spec.sizes.length > 0 ? spec.sizes : ['One Size']) {
      const key = `${spec.slug}:${color}:${size}`;
      const onHand = intBetween(minStock, maxStock, key);
      // A little reserved stock on some rows so "available" is not always
      // identical to on-hand — that difference is the whole point of the screen.
      const reserved = onHand > 2 && hash01(`r:${key}`) > 0.8 ? 1 : 0;
      variants.push({
        id: `var_${spec.slug}_${color}_${size}`.replace(/\s+/g, '-').toLowerCase(),
        sku: `${spec.skuCode}-${color.slice(0, 3)}-${size}`.toUpperCase().replace(/\s+/g, ''),
        size,
        color,
        isEnabled: true,
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
      });
    }
  }

  const createdAt = new Date(EPOCH + index * 6 * 60 * 60 * 1000).toISOString();

  return {
    id: `prod_${spec.slug}`,
    name: spec.name,
    slug: spec.slug,
    // A couple of drafts so the status filter has something to filter.
    status: hash01(`status:${spec.slug}`) > 0.94 ? 'DRAFT' : 'ACTIVE',
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
    shortDescription: spec.shortDescription,
    description: spec.shortDescription,
    materials: spec.materials ?? null,
    careInstructions: spec.careInstructions ?? DEFAULT_CARE_INSTRUCTIONS,
    countryOfOrigin: spec.countryOfOrigin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    targetGroup: spec.targetGroup,
    originalPriceMinor: spec.originalPriceMinor,
    outletPriceMinor: spec.outletPriceMinor,
    currencyCode: CURRENCY_CODE,
    seoTitle: null,
    seoDescription: null,
    publishedFrom: null,
    publishedUntil: null,
    ratingSum: 0,
    reviewCount: 0,
    createdAt,
    updatedAt: createdAt,
    variants,
    images: [],
  };
});

// --- Customers -------------------------------------------------------------

const FIRST_NAMES = ['Nino', 'Giorgi', 'Maren', 'Luca', 'Sofia', 'Elene', 'Dato', 'Anna', 'Levan'];
const LAST_NAMES = ['Beridze', 'Kapanadze', 'Weber', 'Rossi', 'Novak', 'Meyer', 'Lomidze'];

export interface DemoCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED';
  disabledReason: string | null;
  isEmailVerified: boolean;
  createdAt: string;
  orderCount: number;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = Array.from({ length: 24 }, (_, index) => {
  const key = `cust:${index}`;
  const firstName = pick(FIRST_NAMES, `${key}:f`);
  const lastName = pick(LAST_NAMES, `${key}:l`);
  return {
    id: `user_demo_${index}`,
    email:
      `${firstName}.${lastName}${index}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com',
    firstName,
    lastName,
    status: hash01(`${key}:status`) > 0.92 ? 'DISABLED' : 'ACTIVE',
    disabledReason: hash01(`${key}:status`) > 0.92 ? 'Chargeback under review' : null,
    isEmailVerified: hash01(`${key}:verified`) > 0.15,
    createdAt: new Date(EPOCH - intBetween(1, 300, `${key}:age`) * DAY_MS).toISOString(),
    orderCount: intBetween(0, 6, `${key}:orders`),
  };
});

// --- Orders ----------------------------------------------------------------

const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

export interface DemoOrder {
  id: string;
  orderNumber: string;
  status: (typeof ORDER_STATUSES)[number];
  /** Values come from the Prisma PaymentStatus enum — 'PAID', not 'SUCCEEDED'. */
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  customer: { id: string; email: string; firstName: string; lastName: string };
  itemCount: number;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currencyCode: string;
  placedAt: string;
  items: Array<{
    id: string;
    productName: string;
    productSlug: string;
    sku: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
}

export const DEMO_ORDERS: DemoOrder[] = Array.from({ length: 40 }, (_, index) => {
  const key = `order:${index}`;
  const customer = DEMO_CUSTOMERS[index % DEMO_CUSTOMERS.length];
  const status = pick(ORDER_STATUSES, `${key}:status`);
  const lineCount = intBetween(1, 3, `${key}:lines`);

  const items = Array.from({ length: lineCount }, (_, line) => {
    const product = DEMO_PRODUCTS[Math.floor(hash01(`${key}:${line}:p`) * DEMO_PRODUCTS.length)];
    const variant =
      product.variants[Math.floor(hash01(`${key}:${line}:v`) * product.variants.length)];
    const quantity = intBetween(1, 2, `${key}:${line}:q`);
    return {
      id: `item_${index}_${line}`,
      productName: product.name,
      productSlug: product.slug,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      quantity,
      unitPriceMinor: product.outletPriceMinor,
      lineTotalMinor: product.outletPriceMinor * quantity,
    };
  });

  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const shippingMinor = subtotalMinor >= SETTINGS.freeShippingThresholdMinor ? 0 : 499;

  return {
    id: `order_demo_${index}`,
    orderNumber: `OUT-${String(11000 + index)}`,
    status,
    paymentStatus:
      status === 'AWAITING_PAYMENT' ? 'PENDING' : status === 'CANCELLED' ? 'REFUNDED' : 'PAID',
    customer: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    },
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalMinor,
    shippingMinor,
    totalMinor: subtotalMinor + shippingMinor,
    currencyCode: CURRENCY_CODE,
    placedAt: new Date(EPOCH - intBetween(0, 60, `${key}:when`) * DAY_MS).toISOString(),
    items,
  };
});

// --- Reviews ---------------------------------------------------------------

const REVIEW_TITLES = [
  'Exactly as described',
  'Great value',
  'Runs small',
  'Not what I expected',
  'Would buy again',
  'Good but slow delivery',
];

const REVIEW_BODIES = [
  'Fit is true to size and the fabric feels far better than the price suggests.',
  'Arrived quickly and well packed. No complaints at all.',
  'The colour is slightly darker in person than in the photos.',
  'Stitching came loose after two washes, which was disappointing.',
  'Comfortable straight away — no breaking in needed.',
  'Good quality overall, though delivery took longer than the estimate.',
];

export type DemoReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

export interface DemoReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  status: DemoReviewStatus;
  helpfulCount: number;
  adminReply: string | null;
  adminReplyAt: string | null;
  reportCount: number;
  reportedAt: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; slug: string };
  user: { id: string; email: string } | null;
  adminReplyBy: { id: string; email: string } | null;
  moderatedBy: { id: string; email: string } | null;
}

/**
 * Three reviews for most products, with a deliberate spread of statuses so the
 * moderation queue is not empty on first load — a pending queue with nothing in
 * it demonstrates nothing.
 */
export const DEMO_REVIEWS: DemoReview[] = DEMO_PRODUCTS.flatMap((product, productIndex) => {
  const count = intBetween(0, 3, `rev:${product.slug}:count`);
  return Array.from({ length: count }, (_, reviewIndex) => {
    const key = `rev:${product.slug}:${reviewIndex}`;
    const customer = DEMO_CUSTOMERS[(productIndex + reviewIndex) % DEMO_CUSTOMERS.length];
    const roll = hash01(`${key}:status`);
    const status: DemoReviewStatus =
      roll > 0.88 ? 'PENDING' : roll > 0.82 ? 'REJECTED' : roll > 0.78 ? 'HIDDEN' : 'PUBLISHED';
    const reported = hash01(`${key}:reported`) > 0.9;
    const createdAt = new Date(EPOCH - intBetween(1, 120, `${key}:when`) * DAY_MS).toISOString();

    return {
      id: `review_${product.slug}_${reviewIndex}`,
      rating: intBetween(2, 5, `${key}:rating`),
      title: pick(REVIEW_TITLES, `${key}:title`),
      body: pick(REVIEW_BODIES, `${key}:body`),
      authorName: `${customer.firstName} ${customer.lastName.charAt(0)}.`,
      isVerifiedPurchase: hash01(`${key}:verified`) > 0.3,
      status,
      helpfulCount: intBetween(0, 24, `${key}:helpful`),
      adminReply: null,
      adminReplyAt: null,
      reportCount: reported ? intBetween(1, 4, `${key}:reports`) : 0,
      reportedAt: reported ? createdAt : null,
      moderationNote: null,
      moderatedAt: null,
      createdAt,
      updatedAt: createdAt,
      product: { id: product.id, name: product.name, slug: product.slug },
      user: { id: customer.id, email: customer.email },
      adminReplyBy: null,
      moderatedBy: null,
    };
  });
});

// Ratings on the product rows must agree with the reviews above, or the
// dashboard and the review screen contradict each other.
for (const product of DEMO_PRODUCTS) {
  const published = DEMO_REVIEWS.filter(
    (review) => review.product.id === product.id && review.status === 'PUBLISHED',
  );
  product.reviewCount = published.length;
  product.ratingSum = published.reduce((sum, review) => sum + review.rating, 0);
}

export const DEMO_CONTENT_PAGES = CONTENT_PAGES.map((page) => ({
  key: page.key,
  title: page.title,
  body: page.body,
  updatedAt: new Date(EPOCH).toISOString(),
}));

export const DEMO_CAMPAIGNS = CAMPAIGNS.map((campaign) => {
  const startsAt = new Date(EPOCH + campaign.startsInDays * DAY_MS);
  const endsAt = new Date(EPOCH + campaign.endsInDays * DAY_MS);
  return {
    id: `camp_${campaign.slug}`,
    title: campaign.title,
    slug: campaign.slug,
    shortDescription: campaign.shortDescription,
    // Derived from the spec's own window rather than invented, so the status
    // badge agrees with the dates shown beside it.
    status: campaign.startsInDays <= 0 ? 'ACTIVE' : 'SCHEDULED',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    position: campaign.position,
    extraDiscountPercent: campaign.extraDiscountPercent,
    // Prisma's `_count` relation shape, which the list column reads directly.
    _count: { products: campaign.productSlugs.length },
    productSlugs: campaign.productSlugs,
  };
});

export { SETTINGS as DEMO_SETTINGS, CURRENCY_CODE as DEMO_CURRENCY };
