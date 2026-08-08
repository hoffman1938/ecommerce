import { z } from 'zod';

export const productSortSchema = z
  .enum(['recommended', 'newest', 'price_asc', 'price_desc', 'discount', 'popularity', 'rating'])
  .default('recommended');
export type ProductSort = z.infer<typeof productSortSchema>;

export const productQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  size: z.string().trim().max(50).optional(),
  color: z.string().trim().max(50).optional(),
  targetGroup: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).optional(),
  campaign: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  minDiscount: z.coerce.number().int().min(0).max(100).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  inStock: z.coerce.boolean().optional(),
  sort: productSortSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ProductQueryInput = z.infer<typeof productQuerySchema>;

export const reviewSortSchema = z
  .enum(['recent', 'highest', 'lowest', 'helpful'])
  .default('recent');
export type ReviewSort = z.infer<typeof reviewSortSchema>;

export const reviewQuerySchema = z.object({
  sort: reviewSortSchema.optional().default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(5),
});
export type ReviewQueryInput = z.infer<typeof reviewQuerySchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
