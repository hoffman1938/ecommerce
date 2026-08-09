import type { PrismaClient } from '@prisma/client';
import { CAMPAIGNS, PRODUCTS } from '@outlet/catalog';
import { uploadCampaignImage } from './images';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedCampaigns(prisma: PrismaClient): Promise<void> {
  const now = Date.now();
  let active = 0;

  for (const spec of CAMPAIGNS) {
    const startsAt = new Date(now + spec.startsInDays * DAY_MS);
    const endsAt = new Date(now + spec.endsInDays * DAY_MS);
    // Derived from the window rather than stored, so re-seeding cannot leave a
    // campaign marked ACTIVE with a start date in the future.
    const status = spec.startsInDays <= 0 ? 'ACTIVE' : 'SCHEDULED';
    if (status === 'ACTIVE') active += 1;

    let coverImageUrl: string | null = null;
    const existing = await prisma.campaign.findUnique({ where: { slug: spec.slug } });
    if (!existing?.coverImageUrl) {
      coverImageUrl = await uploadCampaignImage(spec.slug, spec.productSlugs, (slug) => {
        const found = PRODUCTS.find((p) => p.slug === slug);
        return found ? { shape: found.shape, colors: found.colors } : undefined;
      });
    }

    const campaign = await prisma.campaign.upsert({
      where: { slug: spec.slug },
      create: {
        title: spec.title,
        slug: spec.slug,
        shortDescription: spec.shortDescription,
        description: `${spec.shortDescription}\n\nCampaign prices apply only while the campaign is running and stocks last.`,
        coverImageUrl,
        startsAt,
        endsAt,
        status,
        position: spec.position,
        seoTitle: spec.title,
        seoDescription: spec.shortDescription,
      },
      // Re-seeding refreshes the window so local campaigns never all expire.
      update: { startsAt, endsAt, status },
    });

    const products = await prisma.product.findMany({
      where: { slug: { in: spec.productSlugs } },
    });
    let position = 0;
    for (const product of products) {
      const campaignPriceMinor = Math.max(
        100,
        Math.round((product.outletPriceMinor * (100 - spec.extraDiscountPercent)) / 100),
      );
      await prisma.campaignProduct.upsert({
        where: { campaignId_productId: { campaignId: campaign.id, productId: product.id } },
        create: {
          campaignId: campaign.id,
          productId: product.id,
          campaignPriceMinor,
          maxQuantityPerOrder: 5,
          position,
        },
        update: { campaignPriceMinor },
      });
      position += 1;
    }
  }

  console.log(
    `Seeded ${CAMPAIGNS.length} campaigns (${active} active, ${CAMPAIGNS.length - active} upcoming)`,
  );
}
