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

export const adminProductSchema = z
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
  .strict()
  .refine((value) => value.outletPriceMinor <= value.originalPriceMinor, {
    message: 'The outlet price cannot be above the original price.',
    path: ['outletPriceMinor'],
  });

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
  })
  .strict();

export const adminNoteSchema = z.object({ internalNote: z.string().trim().max(2000) }).strict();

export const adminReviewModerationSchema = z
  .object({
    status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']),
    moderationNote: z.string().trim().max(500).nullish(),
  })
  .strict();

export const adminReviewReplySchema = z
  .object({ adminReply: z.string().trim().min(1).max(1000) })
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

export const adminContentSchema = z
  .object({ title: trimmed(200), body: z.string().trim().min(1).max(50_000) })
  .strict();

export const adminSettingSchema = z
  .object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })
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
