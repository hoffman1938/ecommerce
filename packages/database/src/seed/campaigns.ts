import type { PrismaClient } from '@prisma/client';
import { uploadCampaignImage } from './images';

const DAY_MS = 24 * 60 * 60 * 1000;

interface CampaignSpec {
  title: string;
  slug: string;
  shortDescription: string;
  /** Offsets in days relative to seed time. */
  startsInDays: number;
  endsInDays: number;
  status: 'ACTIVE' | 'SCHEDULED';
  productSlugs: string[];
  /** Percentage taken off the outlet price for campaign pricing. */
  extraDiscountPercent: number;
  position: number;
}

const CAMPAIGNS: CampaignSpec[] = [
  {
    title: 'Adidas Outlet Sale',
    slug: 'adidas-outlet-sale',
    shortDescription: 'Up to 45% off Adidas essentials, footwear, and more.',
    startsInDays: -1,
    endsInDays: 5,
    status: 'ACTIVE',
    productSlugs: [
      'adidas-essentials-t-shirt',
      'adidas-runfalcon-trainer',
      'adidas-samba-classic',
      'adidas-tiro-track-pants',
      'adidas-trefoil-hoodie',
    ],
    extraDiscountPercent: 10,
    position: 1,
  },
  {
    title: 'Summer Shoes Sale',
    slug: 'summer-shoes-sale',
    shortDescription: 'Sneakers and runners for the season at outlet prices.',
    startsInDays: -2,
    endsInDays: 4,
    status: 'ACTIVE',
    productSlugs: [
      'nike-revolution-7-runner',
      'puma-suede-classic',
      'adidas-runfalcon-trainer',
    ],
    extraDiscountPercent: 5,
    position: 2,
  },
  {
    title: 'Sportswear Weekend',
    slug: 'sportswear-weekend',
    shortDescription: 'Weekend-only deals on training gear and fleece.',
    startsInDays: 0,
    endsInDays: 3,
    status: 'ACTIVE',
    productSlugs: [
      'nike-tech-fleece-hoodie',
      'puma-training-shorts',
      'nike-sportswear-club-tee',
      'adidas-tiro-track-pants',
    ],
    extraDiscountPercent: 15,
    position: 3,
  },
  {
    title: 'Up to 60% Off Nike',
    slug: 'up-to-60-off-nike',
    shortDescription: 'The big Nike drop is coming — up to 60% off.',
    startsInDays: 3,
    endsInDays: 10,
    status: 'SCHEDULED',
    productSlugs: [
      'nike-sportswear-club-tee',
      'nike-revolution-7-runner',
      'nike-windrunner-jacket',
      'nike-everyday-crew-socks',
    ],
    extraDiscountPercent: 20,
    position: 4,
  },
  {
    title: 'Designer Accessories Sale',
    slug: 'designer-accessories-sale',
    shortDescription: 'Belts, caps, and bags from premium brands.',
    startsInDays: 5,
    endsInDays: 12,
    status: 'SCHEDULED',
    productSlugs: [
      'tommy-hilfiger-leather-belt',
      'calvin-klein-cap',
      'puma-backpack-phase',
    ],
    extraDiscountPercent: 10,
    position: 5,
  },
];

export async function seedCampaigns(prisma: PrismaClient): Promise<void> {
  const now = Date.now();
  for (const spec of CAMPAIGNS) {
    const startsAt = new Date(now + spec.startsInDays * DAY_MS);
    const endsAt = new Date(now + spec.endsInDays * DAY_MS);

    let coverImageUrl: string | null = null;
    const existing = await prisma.campaign.findUnique({ where: { slug: spec.slug } });
    if (!existing?.coverImageUrl) {
      coverImageUrl = await uploadCampaignImage(spec.slug, spec.title);
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
        status: spec.status,
        position: spec.position,
        seoTitle: spec.title,
        seoDescription: spec.shortDescription,
      },
      // Re-seeding refreshes the window so local campaigns never all expire.
      update: { startsAt, endsAt, status: spec.status },
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
  console.log(`Seeded ${CAMPAIGNS.length} campaigns (3 active, 2 upcoming)`);
}
