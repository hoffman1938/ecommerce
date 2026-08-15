/**
 * Request validation.
 *
 * Every handler that reads a body parses it through a schema here. The schemas
 * are `.strict()` where it is safe to be, so a request carrying fields the API
 * does not model is rejected rather than silently ignored — that is what stops
 * a client from posting `{ quantity: 1, unitPriceMinor: 1 }` and hoping.
 *
 * Query parameters are handled separately, by coercion helpers, because a
 * query string is always strings and rejecting unknown ones would break every
 * analytics tag a marketing team ever appends to a URL.
 */

import { z } from 'zod';
import { ApiError } from './errors';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('That does not look like an email address.');

/**
 * Long enough to resist guessing, short enough that a password manager's
 * output fits. No composition rules: they push people toward `Password1!`.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.');

export const addressSchema = z
  .object({
    id: z.string().max(64).optional(),
    firstName: trimmed(100),
    lastName: trimmed(100),
    line1: trimmed(200),
    line2: z.string().trim().max(200).nullish(),
    city: trimmed(100),
    region: z.string().trim().max(100).nullish(),
    postalCode: trimmed(20),
    countryCode: z.string().trim().length(2).toUpperCase(),
    phone: z.string().trim().max(40).nullish(),
  })
  .strict();

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: trimmed(100),
    lastName: trimmed(100),
    newsletterOptIn: z.boolean().optional(),
  })
  .strict();

export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(200) })
  .strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema })
  .strict();

export const addToCartSchema = z
  .object({
    variantId: trimmed(64),
    quantity: z.number().int().min(1).max(10).default(1),
    campaignId: z.string().trim().max(64).nullish(),
  })
  .strict();

export const updateQuantitySchema = z
  .object({ quantity: z.number().int().min(0).max(10) })
  .strict();

export const couponSchema = z
  .object({ code: z.string().trim().min(1).max(40).toUpperCase() })
  .strict();

export const checkoutSchema = z
  .object({
    email: emailSchema,
    shippingAddress: addressSchema,
    billingAddress: addressSchema.nullish(),
    billingSameAsShipping: z.boolean().optional(),
    shippingMethod: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'),
    customerNote: z.string().trim().max(500).nullish(),
    idempotencyKey: z.string().trim().max(100).nullish(),
    /**
     * The total the customer was looking at when they pressed the button.
     *
     * Not a price the server trusts — the order is costed entirely from the
     * database either way. It can only cause a *refusal*: if the figure no
     * longer matches, the checkout stops and shows the new one rather than
     * charging a total the customer never agreed to. A campaign ending
     * mid-checkout is the case this catches.
     */
    expectedTotalMinor: z.number().int().min(0).optional(),
  })
  .strict();

export const reviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).nullish(),
    body: z.string().trim().min(10).max(2000),
  })
  .strict();

/**
 * Notification preferences, under either vocabulary.
 *
 * The preferences form round-trips the object `GET /account/profile` gave it
 * (`orderUpdates`, `campaignAnnouncements`, `newsletter`); the profile PATCH
 * and this API's columns use `notifyOrderUpdates` and friends. Both are
 * accepted so neither caller has to translate.
 */
export const notificationPreferencesSchema = z
  .object({
    orderUpdates: z.boolean().optional(),
    campaignAnnouncements: z.boolean().optional(),
    newsletter: z.boolean().optional(),
    notifyOrderUpdates: z.boolean().optional(),
    notifyCampaigns: z.boolean().optional(),
    newsletterOptIn: z.boolean().optional(),
  })
  .strict();

export const profileSchema = z
  .object({
    firstName: trimmed(100).optional(),
    lastName: trimmed(100).optional(),
    newsletterOptIn: z.boolean().optional(),
    notifyOrderUpdates: z.boolean().optional(),
    notifyCampaigns: z.boolean().optional(),
  })
  .strict();

export const returnRequestSchema = z
  .object({
    orderId: trimmed(64),
    reason: trimmed(200),
    customerNote: z.string().trim().max(1000).nullish(),
    items: z
      .array(z.object({ orderItemId: trimmed(64), quantity: z.number().int().min(1).max(100) }))
      .min(1)
      .max(50),
  })
  .strict();

export const newsletterSchema = z.object({ email: emailSchema }).strict();

export const wishlistAddSchema = z
  .object({ productId: trimmed(64), variantId: z.string().trim().max(64).nullish() })
  .strict();

// --- Admin -------------------------------------------------------------------

/**
 * The product fields, before the cross-field rule is attached.
 *
 * Kept separate because `.refine()` produces a ZodEffects, which has no
 * `.partial()` — and the panel's product list edits one field at a time (the
 * status dropdown sends `{ status }` alone). The update route derives the
 * partial from this and re-checks the merged result against the full schema
 * below, so a partial edit cannot slip past the price rule.
 */
export const adminProductFields = z
  .object({
    name: trimmed(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
    brandId: trimmed(64),
    categoryId: z.string().trim().max(64).nullish(),
    shortDescription: z.string().trim().max(500).nullish(),
    description: z.string().trim().max(5000).nullish(),
    targetGroup: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']),
    materials: z.string().trim().max(500).nullish(),
    careInstructions: z.string().trim().max(500).nullish(),
    countryOfOrigin: z.string().trim().max(100).nullish(),
    originalPriceMinor: z.number().int().min(0).max(100_000_00),
    outletPriceMinor: z.number().int().min(0).max(100_000_00),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED']),
    seoTitle: z.string().trim().max(200).nullish(),
    seoDescription: z.string().trim().max(400).nullish(),
    searchKeywords: z.string().trim().max(500).nullish(),
  })
  .strict();

export const adminProductSchema = adminProductFields.refine(
  (value) => value.outletPriceMinor <= value.originalPriceMinor,
  {
    message: 'The outlet price cannot be above the original price.',
    path: ['outletPriceMinor'],
  },
);

/** A product edit that names only the fields it changes. */
export const adminProductPatchSchema = adminProductFields.partial();

export const adminInventorySchema = z
  .object({
    onHandQuantity: z.number().int().min(0).max(1_000_000),
    reason: trimmed(200),
    type: z
      .enum(['RESTOCK', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'CORRECTION', 'DAMAGED'])
      .optional(),
  })
  .strict();

export const adminOrderStatusSchema = z
  .object({
    status: z.enum([
      'DRAFT',
      'AWAITING_PAYMENT',
      'PAID',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'PARTIALLY_RETURNED',
      'RETURNED',
    ]),
    note: z.string().trim().max(500).nullish(),
    /*
     * The dispatch fields. The order screen sends both alongside the status —
     * they are the carrier and consignment number typed in when an order is
     * marked SHIPPED — and this schema is strict, so omitting them rejected
     * the whole request. Marking anything shipped was a 422, and the
     * `shipments` table it should have written to stayed empty.
     */
    trackingNumber: z.string().trim().max(80).nullish(),
    carrier: z.string().trim().max(60).nullish(),
  })
  .strict();

export const adminNoteSchema = z.object({ internalNote: z.string().trim().max(2000) }).strict();

export const adminReviewModerationSchema = z
  .object({
    status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']),
    moderationNote: z.string().trim().max(500).nullish(),
  })
  .strict();

/**
 * A merchant reply.
 *
 * Two spellings because two callers exist: the panel posts `{ body }`, and the
 * field is `adminReply` everywhere in the schema and the API's own vocabulary.
 * Accepting both is a smaller thing to carry than a rename that would have to
 * land in the panel and the API in the same deploy.
 */
export const adminReviewReplySchema = z
  .object({
    adminReply: z.string().trim().min(1).max(1000).optional(),
    body: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.adminReply ?? value.body), {
    message: 'A reply cannot be empty.',
    path: ['body'],
  })
  // Normalised here so the handler receives one field rather than deciding
  // which of two spellings arrived.
  .transform((value) => ({ adminReply: (value.adminReply ?? value.body) as string }));

/** Rewriting the text of a review. The rating is deliberately not editable. */
export const adminReviewContentSchema = z
  .object({
    title: z.string().trim().max(200).nullish(),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

export const adminCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, 'Codes may contain letters, numbers, hyphens and underscores.'),
    type: z.enum(['FIXED', 'PERCENTAGE']),
    value: z.number().int().min(0).max(1_000_000),
    description: z.string().trim().max(200).nullish(),
    minOrderMinor: z.number().int().min(0).nullish(),
    maxDiscountMinor: z.number().int().min(0).nullish(),
    maxRedemptions: z.number().int().min(0).nullish(),
    maxRedemptionsPerCustomer: z.number().int().min(0).nullish(),
    firstOrderOnly: z.boolean().default(false),
    freeShipping: z.boolean().default(false),
    endsAt: z.string().datetime().nullish(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((value) => value.type !== 'PERCENTAGE' || value.value <= 100, {
    message: 'A percentage coupon cannot exceed 100.',
    path: ['value'],
  })
  .refine((value) => value.value > 0 || value.freeShipping, {
    message: 'A coupon has to grant something.',
    path: ['value'],
  });

/**
 * Creating and editing a campaign.
 *
 * The window is checked here as well as by the table's `campaign_window_ordered`
 * constraint: a `CHECK` failure surfaces as a 500 with a SQLite message in it,
 * and "the end has to come after the start" is something the person filling in
 * the form should be told in the form.
 */
export const adminCampaignSchema = z
  .object({
    title: trimmed(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.'),
    shortDescription: z.string().trim().max(500).nullish(),
    description: z.string().trim().max(5000).nullish(),
    coverImageUrl: z.string().trim().max(500).nullish(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED']),
    position: z.number().int().min(0).max(10_000).default(0),
    isVisible: z.boolean().default(true),
    seoTitle: z.string().trim().max(200).nullish(),
    seoDescription: z.string().trim().max(400).nullish(),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: 'A campaign has to end after it starts.',
    path: ['endsAt'],
  });

export const adminContentSchema = z
  .object({ title: trimmed(200), body: z.string().trim().min(1).max(50_000) })
  .strict();

export const adminSettingSchema = z
  .object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })
  .strict();

/**
 * The whole settings form in one request.
 *
 * Every field is optional so the panel can send only what it edits, but the
 * object is `.strict()`: a key `services/settings.ts` does not model would be
 * written to `site_settings` and then ignored by every read, which looks
 * exactly like a save that did not work. Bounds are the ones the storefront
 * can survive — a reservation window of zero minutes expires every cart
 * before checkout can finish.
 */
export const adminSettingsBulkSchema = z
  .object({
    reservationDurationMinutes: z.number().int().min(1).max(1440).optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    standardShippingMinor: z.number().int().min(0).max(100_000_00).optional(),
    expressShippingMinor: z.number().int().min(0).max(100_000_00).optional(),
    freeShippingThresholdMinor: z.number().int().min(0).max(100_000_00).nullable().optional(),
    taxRateBps: z.number().int().min(0).max(10_000).optional(),
    currencyCode: z.string().trim().toUpperCase().length(3).optional(),
    storeName: trimmed(120).optional(),
    supportEmail: emailSchema.optional(),
    heroHeadline: trimmed(200).optional(),
    heroSubheadline: z.string().trim().max(300).optional(),
    heroCtaLabel: trimmed(60).optional(),
    heroCtaHref: z.string().trim().max(200).startsWith('/', 'Use a path such as /shop.').optional(),
  })
  .strict();

// --- Helpers -----------------------------------------------------------------

/**
 * Parses a body, turning a schema failure into a 422 the client can act on.
 *
 * The field paths are included because "invalid input" with no indication of
 * which field is a support ticket waiting to happen. Only the path and the
 * message cross the boundary — never the value that failed.
 */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issues = result.error.issues.slice(0, 10).map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
  throw new ApiError('VALIDATION_FAILED', issues[0]?.message ?? 'That input is not valid.', {
    issues,
  });
}

/** Reads a JSON body, refusing anything that is not an object. */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Send this request as JSON.');
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError('BAD_REQUEST', 'That request body is not valid JSON.');
  }
}

/** An identifier from a URL path. Bounded so it cannot be used as a payload. */
export function pathId(value: string | undefined, label = 'identifier'): string {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError('BAD_REQUEST', `That ${label} is not valid.`);
  }
  return value;
}

/** A slug from a URL path. */
export function pathSlug(value: string | undefined, label = 'slug'): string {
  if (!value || value.length > 200 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new ApiError('BAD_REQUEST', `That ${label} is not valid.`);
  }
  return value;
}
