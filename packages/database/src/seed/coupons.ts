import type { PrismaClient } from '@prisma/client';

export async function seedCoupons(prisma: PrismaClient): Promise<void> {
  const nike = await prisma.brand.findUnique({ where: { slug: 'nike' } });

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    create: {
      code: 'WELCOME10',
      type: 'PERCENTAGE',
      value: 10,
      firstOrderOnly: true,
      maxRedemptionsPerCustomer: 1,
      isActive: true,
    },
    update: {},
  });

  await prisma.coupon.upsert({
    where: { code: 'SAVE20' },
    create: {
      code: 'SAVE20',
      type: 'FIXED',
      value: 2000,
      minOrderMinor: 10000,
      isActive: true,
    },
    update: {},
  });

  await prisma.coupon.upsert({
    where: { code: 'NIKE15' },
    create: {
      code: 'NIKE15',
      type: 'PERCENTAGE',
      value: 15,
      maxDiscountMinor: 5000,
      brandIds: nike ? [nike.id] : [],
      isActive: true,
    },
    update: {},
  });

  console.log('Seeded coupons: WELCOME10, SAVE20, NIKE15');
}
