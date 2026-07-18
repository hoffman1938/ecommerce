import { z } from 'zod';
import { addressSchema } from './address';

export const addCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  campaignId: z.string().min(1).optional().nullable(),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(10),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const applyCouponSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

export const checkoutSubmitSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  billingSameAsShipping: z.boolean().optional().default(true),
  shippingMethod: z.enum(['STANDARD', 'EXPRESS']),
  customerNote: z.string().trim().max(1000).optional().nullable(),
  /** Client-computed total; the server recalculates and rejects mismatches. */
  expectedTotalMinor: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(100),
});
export type CheckoutSubmitInput = z.infer<typeof checkoutSubmitSchema>;

export const newsletterSubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;
