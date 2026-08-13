import type { PrismaClient } from '@prisma/client';
import { COUPONS } from '@outlet/catalog';

/**
 * Coupon codes come from the shared catalogue spec rather than being written
 * out here, so a code the README promises a reviewer exists in the PostgreSQL
 * database and the D1 one alike.
 */
export async function seedCoupons(prisma: PrismaClient): Promise<void> {
  const brands = await prisma.brand.findMany({ select: { id: true, slug: true } });
  const brandIdBySlug = new Map(brands.map((brand) => [brand.slug, brand.id]));

  for (const spec of COUPONS) {
    const brandId = spec.brandSlug ? brandIdBySlug.get(spec.brandSlug) : undefined;
    // A brand-restricted coupon whose brand is missing would silently become
    // an unrestricted one, so it is skipped instead.
    if (spec.brandSlug && !brandId) continue;

    const endsAt =
      spec.expiresInDays === undefined
        ? null
        : new Date(Date.now() + spec.expiresInDays * 24 * 60 * 60 * 1000);

    await prisma.coupon.upsert({
      where: { code: spec.code },
      create: {
        code: spec.code,
        type: spec.type,
        value: spec.value,
        description: spec.description,
        minOrderMinor: spec.minOrderMinor ?? null,
        maxDiscountMinor: spec.maxDiscountMinor ?? null,
        firstOrderOnly: spec.firstOrderOnly ?? false,
        maxRedemptionsPerCustomer: spec.maxRedemptionsPerCustomer ?? null,
        freeShipping: spec.freeShipping ?? false,
        brandIds: brandId ? [brandId] : [],
        endsAt,
        isActive: spec.isActive ?? true,
      },
      update: {},
    });
  }

  console.log(`Seeded ${COUPONS.length} coupons: ${COUPONS.map((c) => c.code).join(', ')}`);
}
