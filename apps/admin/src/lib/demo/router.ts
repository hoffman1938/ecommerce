'use client';

/**
 * Client-side stand-in for the NestJS admin API.
 *
 * `lib/api.ts` routes here when NEXT_PUBLIC_DEMO_MODE is set, so the panel's
 * screens issue exactly the same calls they make against the real backend and
 * neither the components nor the React Query keys know the difference.
 *
 * Coverage is deliberately uneven and honest about it: reads are implemented
 * across every screen, review moderation is implemented in full (it is the
 * slice this demo exists to show), and every other write throws
 * DemoUnsupported so the UI surfaces "not available in the static demo"
 * instead of appearing to save and silently losing the change.
 */

import {
  DEMO_BRANDS,
  DEMO_CAMPAIGNS,
  DEMO_CATEGORIES,
  DEMO_CONTENT_PAGES,
  DEMO_CURRENCY,
  DEMO_ORDERS,
  DEMO_SETTINGS,
  type DemoReviewStatus,
} from './data';
import {
  currentCustomers,
  currentProducts,
  currentReviews,
  ratingFor,
  readState,
  recordAudit,
  writeState,
  type DemoAdminSession,
} from './store';

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

/** The demo carries no rows of this kind, so a detail lookup cannot resolve. */
function notFound(what: string): never {
  throw new DemoApiError(404, `${what} not found — the static demo seeds none.`);
}

/** Thrown for endpoints the static demo cannot honour. */
function unsupported(what: string): never {
  throw new DemoApiError(
    501,
    `${what} is not available in the static demo — it needs the real API and database.`,
    'DEMO_UNSUPPORTED',
  );
}

/**
 * The demo super admin.
 *
 * Holds every permission so the whole panel is reachable. This is a UI
 * affordance, not authorization: there is no server, so nothing here is
 * enforced. Never sign in with a password you use anywhere real.
 */
const DEMO_PERMISSIONS = [
  'dashboard.view',
  'products.view',
  'products.create',
  'products.update',
  'products.archive',
  'inventory.view',
  'inventory.adjust',
  'reservations.view',
  'reservations.cancel',
  'orders.view',
  'orders.update',
  'orders.cancel',
  'refunds.create',
  'returns.view',
  'returns.manage',
  'campaigns.view',
  'campaigns.manage',
  'campaigns.publish',
  'customers.view',
  'customers.disable',
  'customers.support',
  'coupons.view',
  'coupons.manage',
  'reviews.view',
  'reviews.moderate',
  'reviews.reply',
  'reviews.delete',
  'content.manage',
  'settings.update',
  'audit_logs.view',
  'admin_users.manage',
];

const DEMO_SESSION: DemoAdminSession = {
  id: 'user_demo_superadmin',
  email: 'demo-admin@outlet.local',
  firstName: 'Demo',
  lastName: 'Admin',
  roles: ['Super Admin'],
  permissions: DEMO_PERMISSIONS,
};

interface Query {
  [key: string]: string | undefined;
}

/**
 * Expand a generated order into the full OrderDto the screens expect.
 *
 * The order pages read addresses, timeline, payments and shipments without
 * guarding, so these have to be present and well-formed rather than omitted.
 */
function toOrderDto(order: (typeof DEMO_ORDERS)[number]) {
  const address = {
    id: `addr_${order.id}`,
    firstName: order.customer.firstName,
    lastName: order.customer.lastName,
    line1: 'Example Street 12',
    line2: null,
    city: 'Berlin',
    region: null,
    postalCode: '10115',
    countryCode: 'DE',
    phone: null,
  };

  // Every status the order has passed through, oldest first.
  const progression = ['AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const reachedIndex = progression.indexOf(order.status);
  const timeline = (
    reachedIndex >= 0 ? progression.slice(0, reachedIndex + 1) : [order.status]
  ).map((status, index) => ({
    status,
    occurredAt: new Date(Date.parse(order.placedAt) + index * 3600_000).toISOString(),
    note: null,
  }));

  const paid = order.paymentStatus === 'PAID';
  return {
    ...order,
    email: order.customer.email,
    discountMinor: 0,
    taxMinor: 0,
    couponCode: null,
    // OrderItemDto names these `name` and `totalMinor`; the generated rows use
    // productName/lineTotalMinor, so map rather than spread blindly.
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      sku: item.sku,
      brandName: null,
      size: item.size,
      color: item.color,
      imageUrl: null,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.lineTotalMinor,
      returnedQuantity: 0,
      returnableQuantity: item.quantity,
    })),
    // AdminOrderDetail extends OrderDto with these; the detail page reads
    // `refunds.length` and maps `statusHistory` without guarding.
    internalNote: null,
    customerNote: null,
    statusHistory: timeline.map((entry, index) => ({
      id: `hist_${order.id}_${index}`,
      fromStatus: index === 0 ? null : timeline[index - 1].status,
      toStatus: entry.status,
      note: null,
      createdAt: entry.occurredAt,
    })),
    refunds: [],
    shippingAddress: address,
    billingAddress: address,
    shippingMethod: 'STANDARD',
    payments: [
      {
        id: `pay_${order.id}`,
        provider: 'mock',
        status: order.paymentStatus,
        amountMinor: order.totalMinor,
        // The detail page computes refundable = amount - refunded, so this has
        // to be a number rather than absent.
        refundedAmountMinor: order.paymentStatus === 'REFUNDED' ? order.totalMinor : 0,
        failureReason: null,
        createdAt: order.placedAt,
      },
    ],
    shipments: [],
    timeline,
    paidAt: paid ? order.placedAt : null,
    cancelledAt: order.status === 'CANCELLED' ? order.placedAt : null,
    cancelReason: order.status === 'CANCELLED' ? 'Cancelled in demo data' : null,
    isCancellable: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING'].includes(order.status),
    createdAt: order.placedAt,
  };
}

function paginate<T>(items: T[], query: Query) {
  const page = Math.max(1, Number(query.page ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? '25')));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

function matches(haystack: Array<string | null | undefined>, needle: string): boolean {
  const q = needle.toLowerCase();
  return haystack.some((value) => (value ?? '').toLowerCase().includes(q));
}

// --- Reviews ---------------------------------------------------------------

function listReviews(query: Query) {
  let rows = currentReviews();

  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.productId) rows = rows.filter((r) => r.product.id === query.productId);
  if (query.rating) rows = rows.filter((r) => r.rating === Number(query.rating));
  if (query.verified)
    rows = rows.filter((r) => r.isVerifiedPurchase === (query.verified === 'true'));
  if (query.reported === 'true') rows = rows.filter((r) => r.reportCount > 0);
  if (query.replied === 'true') rows = rows.filter((r) => r.adminReply !== null);
  if (query.replied === 'false') rows = rows.filter((r) => r.adminReply === null);
  if (query.q) {
    rows = rows.filter((r) => matches([r.body, r.title, r.authorName, r.product.name], query.q!));
  }

  const sorted = [...rows];
  switch (query.sort) {
    case 'oldest':
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case 'highest':
      sorted.sort((a, b) => b.rating - a.rating);
      break;
    case 'lowest':
      sorted.sort((a, b) => a.rating - b.rating);
      break;
    case 'helpful':
      sorted.sort((a, b) => b.helpfulCount - a.helpfulCount);
      break;
    case 'reported':
      sorted.sort((a, b) => b.reportCount - a.reportCount);
      break;
    default:
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return paginate(sorted, query);
}

function reviewStats(query: Query) {
  // Same filters as the list minus status, so the tab counts stay honest.
  const scoped = listReviews({ ...query, status: undefined, page: '1', pageSize: '100000' })
    .items as ReturnType<typeof currentReviews>;

  const statusCounts: Record<string, number> = {
    PENDING: 0,
    PUBLISHED: 0,
    REJECTED: 0,
    HIDDEN: 0,
  };
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let ratingTotal = 0;

  for (const review of scoped) {
    statusCounts[review.status] = (statusCounts[review.status] ?? 0) + 1;
    if (review.status === 'PUBLISHED') {
      distribution[String(review.rating)] = (distribution[String(review.rating)] ?? 0) + 1;
      ratingTotal += review.rating;
    }
  }

  const publishedCount = statusCounts.PUBLISHED;
  return {
    statusCounts,
    distribution,
    reported: scoped.filter((r) => r.reportCount > 0).length,
    unanswered: scoped.filter((r) => r.status === 'PUBLISHED' && !r.adminReply).length,
    publishedCount,
    ratingAverage: publishedCount > 0 ? ratingTotal / publishedCount : null,
  };
}

function findReview(id: string) {
  const review = currentReviews().find((r) => r.id === id);
  if (!review) throw new DemoApiError(404, 'Review not found');
  return review;
}

function patchReview(id: string, patch: Record<string, unknown>) {
  writeState((state) => {
    state.reviews[id] = { ...(state.reviews[id] ?? {}), ...patch };
  });
  return findReview(id);
}

// --- Router ----------------------------------------------------------------

export function demoRequest(method: string, path: string, body?: Record<string, unknown>): unknown {
  const [rawPath, rawQuery] = path.split('?');
  const query: Query = Object.fromEntries(new URLSearchParams(rawQuery ?? '').entries());
  const segments = rawPath.split('/').filter(Boolean);
  const verb = method.toUpperCase();

  // --- auth ---
  if (rawPath === '/auth/me') {
    return { user: readState().session };
  }
  if (rawPath === '/auth/login' && verb === 'POST') {
    // Any credentials are accepted: there is no user table to check against,
    // and pretending otherwise would imply a security boundary that is not here.
    writeState((state) => {
      state.session = {
        ...DEMO_SESSION,
        email: typeof body?.email === 'string' && body.email ? body.email : DEMO_SESSION.email,
      };
    });
    return { user: readState().session };
  }
  if (rawPath === '/auth/logout' && verb === 'POST') {
    writeState((state) => {
      state.session = null;
    });
    return { message: 'Signed out.' };
  }

  if (segments[0] !== 'admin') throw new DemoApiError(404, `No demo handler for ${path}`);
  const resource = segments[1];
  const id = segments[2];
  const action = segments[3];

  // --- reviews ---
  if (resource === 'reviews') {
    if (verb === 'GET' && id === 'stats') return reviewStats(query);
    if (verb === 'GET' && !id) return listReviews(query);
    if (verb === 'GET' && id) return findReview(id);

    if (verb === 'POST' && id === 'bulk') {
      const ids = Array.isArray(body?.ids) ? (body!.ids as string[]) : [];
      const act = String(body?.action ?? '');
      const statusFor: Record<string, DemoReviewStatus> = {
        publish: 'PUBLISHED',
        reject: 'REJECTED',
        hide: 'HIDDEN',
        pending: 'PENDING',
      };
      if (act === 'delete') {
        writeState((state) => {
          state.deletedReviewIds.push(...ids);
        });
      } else if (act === 'clearReports') {
        for (const target of ids) patchReview(target, { reportCount: 0, reportedAt: null });
      } else if (statusFor[act]) {
        for (const target of ids) {
          patchReview(target, {
            status: statusFor[act],
            moderatedAt: new Date().toISOString(),
            moderatedBy: { id: DEMO_SESSION.id, email: readState().session?.email ?? '' },
          });
        }
      } else {
        throw new DemoApiError(400, `Unknown bulk action "${act}"`);
      }
      recordAudit(`review.bulk_${act}`, 'ProductReview', null);
      return { message: `Updated ${ids.length} review(s).`, count: ids.length, ids };
    }

    if (verb === 'POST' && id && action === 'status') {
      const updated = patchReview(id, {
        status: body?.status as DemoReviewStatus,
        moderationNote: (body?.note as string) ?? null,
        moderatedAt: new Date().toISOString(),
        moderatedBy: { id: DEMO_SESSION.id, email: readState().session?.email ?? '' },
      });
      recordAudit('review.status_changed', 'ProductReview', id);
      return updated;
    }

    if (verb === 'POST' && id && action === 'reply') {
      const updated = patchReview(id, {
        adminReply: String(body?.body ?? ''),
        adminReplyAt: new Date().toISOString(),
        adminReplyBy: { id: DEMO_SESSION.id, email: readState().session?.email ?? '' },
      });
      recordAudit('review.replied', 'ProductReview', id);
      return updated;
    }

    if (verb === 'DELETE' && id && action === 'reply') {
      const updated = patchReview(id, { adminReply: null, adminReplyAt: null, adminReplyBy: null });
      recordAudit('review.reply_removed', 'ProductReview', id);
      return updated;
    }

    if (verb === 'POST' && id && action === 'clear-reports') {
      const updated = patchReview(id, { reportCount: 0, reportedAt: null });
      recordAudit('review.reports_cleared', 'ProductReview', id);
      return updated;
    }

    if (verb === 'PATCH' && id) {
      const updated = patchReview(id, {
        ...(body?.rating !== undefined ? { rating: Number(body.rating) } : {}),
        ...(body?.title !== undefined ? { title: (body.title as string) ?? null } : {}),
        ...(body?.body !== undefined ? { body: String(body.body) } : {}),
        updatedAt: new Date().toISOString(),
      });
      recordAudit('review.updated', 'ProductReview', id);
      return updated;
    }

    if (verb === 'DELETE' && id) {
      writeState((state) => {
        state.deletedReviewIds.push(id);
      });
      recordAudit('review.deleted', 'ProductReview', id);
      return { message: 'Review deleted.' };
    }
  }

  // --- dashboard ---
  // Shape must match DashboardStatsDto exactly: the page maps over four of
  // these arrays without guarding, so a missing key is a blank screen.
  if (resource === 'dashboard' && verb === 'GET') {
    const orders = DEMO_ORDERS;
    const paidOrders = orders.filter((order) => order.status !== 'CANCELLED');
    const revenueMinor = paidOrders.reduce((sum, order) => sum + order.totalMinor, 0);

    const lowStockVariants = currentProducts()
      .flatMap((product) =>
        product.variants.map((variant) => ({
          variantId: variant.id,
          sku: variant.sku,
          productName: product.name,
          availableQuantity: variant.available,
        })),
      )
      .filter((row) => row.availableQuantity <= DEMO_SETTINGS.lowStockThreshold)
      .sort((a, b) => a.availableQuantity - b.availableQuantity);

    // Revenue bucketed by calendar day, most recent last.
    const byDay = new Map<string, { revenueMinor: number; orderCount: number }>();
    for (const order of paidOrders) {
      const day = order.placedAt.slice(0, 10);
      const bucket = byDay.get(day) ?? { revenueMinor: 0, orderCount: 0 };
      bucket.revenueMinor += order.totalMinor;
      bucket.orderCount += 1;
      byDay.set(day, bucket);
    }

    const byBrand = new Map<string, { revenueMinor: number; unitsSold: number }>();
    for (const order of paidOrders) {
      for (const item of order.items) {
        const product = currentProducts().find((p) => p.slug === item.productSlug);
        const brandName = product?.brand.name ?? 'Unknown';
        const bucket = byBrand.get(brandName) ?? { revenueMinor: 0, unitsSold: 0 };
        bucket.revenueMinor += item.lineTotalMinor;
        bucket.unitsSold += item.quantity;
        byBrand.set(brandName, bucket);
      }
    }

    return {
      revenueMinor,
      orderCount: orders.length,
      averageOrderValueMinor: orders.length > 0 ? Math.round(revenueMinor / orders.length) : 0,
      lowStockCount: lowStockVariants.length,
      activeReservationCount: 0,
      expiredReservationCount: 0,
      failedPaymentCount: orders.filter((o) => o.paymentStatus === 'FAILED').length,
      activeCampaignCount: DEMO_CAMPAIGNS.filter((c) => c.status === 'ACTIVE').length,
      upcomingCampaignCount: DEMO_CAMPAIGNS.filter((c) => c.status === 'SCHEDULED').length,
      openReturnCount: 0,
      recentOrders: [...orders]
        .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
        .slice(0, 10)
        .map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          email: order.customer.email,
          totalMinor: order.totalMinor,
          status: order.status,
          placedAt: order.placedAt,
        })),
      salesByDay: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([day, value]) => ({ day, ...value })),
      salesByBrand: [...byBrand.entries()]
        .map(([brandName, value]) => ({ brandName, ...value }))
        .sort((a, b) => b.revenueMinor - a.revenueMinor)
        .slice(0, 8),
      salesByCampaign: DEMO_CAMPAIGNS.filter((c) => c.status === 'ACTIVE').map((campaign) => ({
        campaignTitle: campaign.title,
        revenueMinor: 0,
        unitsSold: 0,
      })),
      lowStockVariants: lowStockVariants.slice(0, 10),
    };
  }

  // --- products ---
  if (resource === 'products' && verb === 'GET') {
    const products = currentProducts();
    if (id) {
      const product = products.find((p) => p.id === id || p.slug === id);
      if (!product) throw new DemoApiError(404, 'Product not found');
      // The editor binds to flat ids and a different variant shape than the
      // list rows use, so the detail response is mapped rather than passed
      // through — a missing brandId leaves the <select> invalid and silently
      // blocks the form from ever submitting.
      return {
        ...product,
        ...ratingFor(product.id),
        brandId: product.brand.id,
        categoryId: product.category?.id ?? '',
        taxClass: 'STANDARD',
        searchKeywords: '',
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          priceOverrideMinor: null,
          isEnabled: variant.isEnabled,
          inventory: {
            onHandQuantity: variant.onHand,
            reservedQuantity: variant.reserved,
          },
        })),
        images: product.images.map((image) => ({
          id: image.id,
          url: image.url,
          altText: image.altText,
        })),
      };
    }
    let rows = products;
    if (query.q) rows = rows.filter((p) => matches([p.name, p.slug, p.brand.name], query.q!));
    if (query.status) rows = rows.filter((p) => p.status === query.status);
    return paginate(rows, query);
  }

  // --- orders ---
  if (resource === 'orders' && verb === 'GET') {
    if (id === 'refunds') return paginate([], query);
    if (id) {
      const order = DEMO_ORDERS.find((o) => o.id === id);
      if (!order) throw new DemoApiError(404, 'Order not found');
      return toOrderDto(order);
    }
    let rows = DEMO_ORDERS;
    if (query.status) rows = rows.filter((o) => o.status === query.status);
    if (query.q) rows = rows.filter((o) => matches([o.orderNumber, o.customer.email], query.q!));
    const page = paginate(rows, query);
    return { ...page, items: page.items.map(toOrderDto) };
  }

  // --- customers ---
  if (resource === 'customers' && verb === 'GET') {
    const customers = currentCustomers();
    if (id) {
      const customer = customers.find((c) => c.id === id);
      if (!customer) throw new DemoApiError(404, 'Customer not found');
      return {
        ...customer,
        addresses: [],
        orders: DEMO_ORDERS.filter((o) => o.customer.id === id),
        returnRequests: [],
        supportNotes: [],
        refunds: [],
      };
    }
    let rows = customers;
    if (query.q) rows = rows.filter((c) => matches([c.email, c.firstName, c.lastName], query.q!));
    return paginate(
      rows.map((c) => ({ ...c, _count: { orders: c.orderCount } })),
      query,
    );
  }

  if (resource === 'customers' && verb === 'POST' && id && action === 'disable') {
    writeState((state) => {
      state.customers[id] = { status: 'DISABLED', disabledReason: String(body?.reason ?? '') };
    });
    recordAudit('customer.disabled', 'User', id);
    return { message: 'Account disabled.' };
  }
  if (resource === 'customers' && verb === 'POST' && id && action === 'enable') {
    writeState((state) => {
      state.customers[id] = { status: 'ACTIVE', disabledReason: null };
    });
    recordAudit('customer.enabled', 'User', id);
    return { message: 'Account re-enabled.' };
  }

  // --- inventory ---
  if (resource === 'inventory' && verb === 'GET') {
    if (id === 'movements' || id === 'reservations') return paginate([], query);
    // Shape must match InventoryRowDto.
    const rows = currentProducts().flatMap((product) =>
      product.variants.map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        productId: product.id,
        productName: product.name,
        brandName: product.brand.name,
        size: variant.size,
        color: variant.color,
        onHandQuantity: variant.onHand,
        reservedQuantity: variant.reserved,
        soldQuantity: 0,
        damagedQuantity: 0,
        returnedQuantity: 0,
        availableQuantity: variant.available,
        isEnabled: variant.isEnabled,
      })),
    );
    let filtered = query.q ? rows.filter((r) => matches([r.sku, r.productName], query.q!)) : rows;
    if (query.lowStockOnly === 'true') {
      filtered = filtered.filter((r) => r.availableQuantity <= DEMO_SETTINGS.lowStockThreshold);
    }
    return paginate(filtered, query);
  }

  // --- reference / settings reads ---
  if (resource === 'brands' && verb === 'GET') return DEMO_BRANDS;
  if (resource === 'categories' && verb === 'GET') return DEMO_CATEGORIES;
  // These four return bare arrays, not paginated envelopes — the pages map over
  // the response directly, so wrapping it crashes them.
  if (resource === 'campaigns' && verb === 'GET') {
    if (id) {
      const campaign = DEMO_CAMPAIGNS.find((c) => c.id === id);
      if (!campaign) throw new DemoApiError(404, 'Campaign not found');
      const products = currentProducts();
      return {
        ...campaign,
        description: campaign.shortDescription,
        isVisible: true,
        seoTitle: null,
        seoDescription: null,
        // Resolve the spec's product slugs into the assignment rows the editor
        // renders, discounted by the campaign's own extra percentage.
        products: campaign.productSlugs
          .map((slug) => products.find((p) => p.slug === slug))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((product) => ({
            id: `cp_${campaign.id}_${product.id}`,
            productId: product.id,
            campaignPriceMinor: Math.round(
              product.outletPriceMinor * (1 - campaign.extraDiscountPercent / 100),
            ),
            maxQuantityPerOrder: null,
            product: {
              id: product.id,
              name: product.name,
              outletPriceMinor: product.outletPriceMinor,
              brand: { name: product.brand.name },
            },
          })),
      };
    }
    return DEMO_CAMPAIGNS;
  }
  if (resource === 'coupons' && verb === 'GET') return id ? notFound('Coupon') : [];
  if (resource === 'returns' && verb === 'GET') return id ? notFound('Return request') : [];
  if (resource === 'settings' && verb === 'GET') {
    return { ...DEMO_SETTINGS, currencyCode: DEMO_CURRENCY };
  }
  if (resource === 'content' && verb === 'GET') return DEMO_CONTENT_PAGES;
  if (resource === 'audit-logs' && verb === 'GET') return paginate(readState().auditLog, query);
  if (resource === 'roles' && verb === 'GET') {
    return [
      {
        id: 'role_super',
        name: 'Super Admin',
        description: 'Every permission.',
        permissions: DEMO_PERMISSIONS,
      },
      {
        id: 'role_moderator',
        name: 'Moderator',
        description: 'Reviews only — no orders, money or inventory.',
        permissions: [
          'dashboard.view',
          'reviews.view',
          'reviews.moderate',
          'reviews.reply',
          'reviews.delete',
        ],
      },
    ];
  }
  if (resource === 'users' && verb === 'GET') {
    return [
      {
        id: DEMO_SESSION.id,
        email: readState().session?.email ?? DEMO_SESSION.email,
        firstName: DEMO_SESSION.firstName,
        lastName: DEMO_SESSION.lastName,
        status: 'ACTIVE',
        // AdminUserRow.roles is string[], not objects.
        roles: ['Super Admin'],
      },
    ];
  }

  // Everything else is a write the static demo cannot honour. Naming the
  // resource makes the toast useful rather than generic.
  if (verb !== 'GET') unsupported(`Editing ${resource}`);
  throw new DemoApiError(404, `No demo handler for ${method} ${path}`);
}
