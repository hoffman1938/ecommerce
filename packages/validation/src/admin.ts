import { z } from 'zod';

// --- Products --------------------------------------------------------------

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits, and hyphens');

export const variantInputSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).optional().nullable(),
  size: z.string().trim().max(50).optional().nullable(),
  color: z.string().trim().max(50).optional().nullable(),
  priceOverrideMinor: z.number().int().nonnegative().optional().nullable(),
  weightGrams: z.number().int().nonnegative().optional().nullable(),
  dimensions: z.string().trim().max(100).optional().nullable(),
  isEnabled: z.boolean().optional().default(true),
  attributes: z.record(z.string()).optional().nullable(),
  initialQuantity: z.number().int().nonnegative().optional(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: slugSchema,
  brandId: z.string().min(1),
  categoryId: z.string().min(1).optional().nullable(),
  shortDescription: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(20000).optional().nullable(),
  targetGroup: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).default('UNISEX'),
  materials: z.string().trim().max(1000).optional().nullable(),
  careInstructions: z.string().trim().max(1000).optional().nullable(),
  countryOfOrigin: z.string().trim().max(100).optional().nullable(),
  originalPriceMinor: z.number().int().positive(),
  outletPriceMinor: z.number().int().positive(),
  taxClass: z.enum(['STANDARD', 'REDUCED', 'ZERO']).default('STANDARD'),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED']).default('DRAFT'),
  publishedFrom: z.string().datetime().optional().nullable(),
  publishedUntil: z.string().datetime().optional().nullable(),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(500).optional().nullable(),
  searchKeywords: z.string().trim().max(1000).optional().nullable(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

// --- Campaigns -------------------------------------------------------------

export const campaignInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug: slugSchema,
  shortDescription: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(20000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED']).default('DRAFT'),
  position: z.number().int().default(0),
  isVisible: z.boolean().default(true),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(500).optional().nullable(),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const campaignProductInputSchema = z.object({
  productId: z.string().min(1),
  campaignPriceMinor: z.number().int().positive().optional().nullable(),
  maxQuantityPerOrder: z.number().int().positive().optional().nullable(),
  quantityLimit: z.number().int().positive().optional().nullable(),
  position: z.number().int().default(0),
});
export type CampaignProductInput = z.infer<typeof campaignProductInputSchema>;

// --- Inventory -------------------------------------------------------------

export const inventoryAdjustSchema = z.object({
  variantId: z.string().min(1),
  type: z.enum(['RESTOCK', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'CORRECTION', 'DAMAGED']),
  /** For CORRECTION this is the new absolute on-hand value; otherwise a delta. */
  quantity: z.number().int(),
  reason: z.string().trim().min(1).max(500),
});
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

export const cancelReservationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

// --- Brands / categories ---------------------------------------------------

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional().nullable(),
  isFeatured: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export const categoryLevelSchema = z.enum(['department', 'category', 'subcategory']);
export const sizeChartGroupSchema = z.enum(['tops', 'shirts', 'bottoms']);
export const targetGroupSchema = z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']);

/**
 * `position`, `level` and `targetGroup` are optional rather than defaulted:
 * this schema backs the update endpoint as well as create, and a default would
 * silently reset a category's ordering or move it to another department every
 * time someone renamed it. The service fills the gaps — level and department
 * from the parent, position from the end of the sibling list.
 */
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  /** URL fragment within the parent. Falls back to the slug when omitted. */
  pathSegment: slugSchema.optional(),
  parentId: z.string().min(1).optional().nullable(),
  targetGroup: targetGroupSchema.optional(),
  level: categoryLevelSchema.optional(),
  sizeChartGroup: sizeChartGroupSchema.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  position: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** Sibling ordering, sent as the full list so the result cannot be ambiguous. */
export const categoryReorderSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
});
export type CategoryReorderInput = z.infer<typeof categoryReorderSchema>;

/** Re-parenting: the same call covers "move to another category" and "promote". */
export const categoryMoveSchema = z.object({
  parentId: z.string().min(1).nullable(),
  position: z.number().int().min(0).optional(),
});
export type CategoryMoveInput = z.infer<typeof categoryMoveSchema>;

export const categoryVisibilitySchema = z.object({ isActive: z.boolean() });
export type CategoryVisibilityInput = z.infer<typeof categoryVisibilitySchema>;

/**
 * Deleting a category that still holds products.
 *
 * There is no default. Orphaning a product is a data loss the shop only
 * notices weeks later, so the caller has to say out loud where the products go
 * and what happens to the subcategories underneath.
 */
export const categoryDeleteSchema = z
  .object({
    /** `reassign` moves products to another category; `detach` leaves them uncategorised. */
    strategy: z.enum(['reassign', 'detach']),
    targetCategoryId: z.string().min(1).optional().nullable(),
    /** `promote` lifts children to this row's parent; `cascade` deletes them too. */
    childStrategy: z.enum(['promote', 'cascade']).default('promote'),
  })
  .refine((input) => input.strategy !== 'reassign' || Boolean(input.targetCategoryId), {
    message: 'Choose the category the products should move to.',
    path: ['targetCategoryId'],
  });
export type CategoryDeleteInput = z.infer<typeof categoryDeleteSchema>;

// --- Coupons ---------------------------------------------------------------

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(64)
      .regex(/^[A-Z0-9-]+$/),
    type: z.enum(['FIXED', 'PERCENTAGE']),
    value: z.number().int().positive(),
    minOrderMinor: z.number().int().nonnegative().optional().nullable(),
    maxDiscountMinor: z.number().int().positive().optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    maxRedemptionsPerCustomer: z.number().int().positive().optional().nullable(),
    firstOrderOnly: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
    brandIds: z.array(z.string()).optional().default([]),
    categoryIds: z.array(z.string()).optional().default([]),
    productIds: z.array(z.string()).optional().default([]),
    campaignIds: z.array(z.string()).optional().default([]),
  })
  .refine((c) => c.type !== 'PERCENTAGE' || c.value <= 100, {
    message: 'Percentage discount cannot exceed 100',
    path: ['value'],
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

// --- Orders / returns / refunds --------------------------------------------

export const orderStatusUpdateSchema = z.object({
  status: z.enum(['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  note: z.string().trim().max(1000).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
  carrier: z.string().trim().max(100).optional().nullable(),
});
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;

export const createReturnSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  customerNote: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().min(1),
        reason: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const returnDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  internalNote: z.string().trim().max(1000).optional().nullable(),
});
export type ReturnDecisionInput = z.infer<typeof returnDecisionSchema>;

export const receiveReturnItemsSchema = z.object({
  items: z
    .array(
      z.object({
        returnItemId: z.string().min(1),
        receivedQuantity: z.number().int().min(0),
        condition: z.enum(['UNINSPECTED', 'RESELLABLE', 'DAMAGED']),
        restock: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type ReceiveReturnItemsInput = z.infer<typeof receiveReturnItemsSchema>;

export const createRefundSchema = z.object({
  orderId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  returnRequestId: z.string().min(1).optional().nullable(),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

// --- Reviews ---------------------------------------------------------------

export const reviewStatusSchema = z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']);

export const adminReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
  status: reviewStatusSchema.optional(),
  productId: z.string().trim().min(1).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  /** "true" narrows to verified purchases, "false" to unverified. */
  verified: z.enum(['true', 'false']).optional(),
  /** Only rows shoppers have reported. */
  reported: z.enum(['true']).optional(),
  /** Only rows the shop has (not) answered. */
  replied: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'reported', 'helpful']).default('newest'),
});
export type AdminReviewQueryInput = z.infer<typeof adminReviewQuerySchema>;

export const reviewModerationSchema = z.object({
  status: reviewStatusSchema,
  /** Internal note explaining the decision; never shown to shoppers. */
  note: z.string().trim().max(1000).optional(),
});
export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;

export const reviewUpdateSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(5000).optional(),
  authorName: z.string().trim().min(1).max(120).optional(),
});
export type ReviewUpdateInput = z.infer<typeof reviewUpdateSchema>;

export const reviewReplySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type ReviewReplyInput = z.infer<typeof reviewReplySchema>;

/**
 * Bulk moderation. `delete` is separated from the status transitions because it
 * is the only irreversible action and carries its own permission.
 */
export const reviewBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['publish', 'reject', 'hide', 'pending', 'delete', 'clearReports']),
  note: z.string().trim().max(1000).optional(),
});
export type ReviewBulkInput = z.infer<typeof reviewBulkSchema>;

// --- Settings / content ----------------------------------------------------

export const siteSettingsSchema = z.object({
  reservationDurationMinutes: z.number().int().min(1).max(1440),
  lowStockThreshold: z.number().int().min(0).max(1000),
  standardShippingMinor: z.number().int().nonnegative(),
  expressShippingMinor: z.number().int().nonnegative(),
  freeShippingThresholdMinor: z.number().int().nonnegative().nullable(),
  taxRateBps: z.number().int().min(0).max(10000),
});
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export const contentPageSchema = z.object({
  key: z.enum([
    'privacy_policy',
    'terms',
    'cookie_policy',
    'faq',
    'shipping_info',
    'returns_info',
    'contact_info',
  ]),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().max(100000),
});
export type ContentPageInput = z.infer<typeof contentPageSchema>;

// --- Admin users -----------------------------------------------------------

export const adminAssignRolesSchema = z.object({
  roleNames: z.array(z.string().min(1)).min(0),
});
export type AdminAssignRolesInput = z.infer<typeof adminAssignRolesSchema>;

export const disableCustomerSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type DisableCustomerInput = z.infer<typeof disableCustomerSchema>;

export const supportNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});
export type SupportNoteInput = z.infer<typeof supportNoteSchema>;
