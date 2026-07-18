import { z } from 'zod';

export const productSortSchema = z
  .enum(['recommended', 'newest', 'price_asc', 'price_desc', 'discount', 'popularity'])
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
  inStock: z.coerce.boolean().optional(),
  sort: productSortSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ProductQueryInput = z.infer<typeof productQuerySchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
