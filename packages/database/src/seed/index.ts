/**
 * Idempotent local seed. Safe to run repeatedly — it upserts by natural keys
 * (email, slug, SKU, order number) and never duplicates data. Runs
 * automatically via the Docker Compose `migrate` service and manually via
 * `pnpm db:seed`.
 */
import { PrismaClient } from '@prisma/client';
import { seedRbac } from './rbac';
import { seedUsers } from './users';
import { seedSettings, seedContent } from './settings';
import { seedCatalog } from './catalog';
import { seedCampaigns } from './campaigns';
import { seedCoupons } from './coupons';
import { seedOrders } from './orders';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log('Seeding database...');
    await seedRbac(prisma);
    await seedUsers(prisma);
    await seedSettings(prisma);
    await seedContent(prisma);
    await seedCatalog(prisma);
    await seedCampaigns(prisma);
    await seedCoupons(prisma);
    await seedOrders(prisma);
    console.log('Seed complete.');
    console.log(
      'Local credentials -> Super Admin: admin@example.local / Admin123!  Customer: customer@example.local / Customer123!',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
