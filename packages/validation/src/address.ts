import { z } from 'zod';

export const addressSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().min(1).max(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'Use a 2-letter ISO country code'),
  phone: z.string().trim().max(30).optional().nullable(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const savedAddressSchema = addressSchema.extend({
  type: z.enum(['SHIPPING', 'BILLING', 'BOTH']).default('BOTH'),
  isDefaultShipping: z.boolean().optional().default(false),
  isDefaultBilling: z.boolean().optional().default(false),
});
export type SavedAddressInput = z.infer<typeof savedAddressSchema>;
