import type { PrismaClient } from '@prisma/client';
import {
  BRANDS,
  CATALOG_EPOCH,
  CATEGORIES,
  DEFAULT_CARE_INSTRUCTIONS,
  DEFAULT_COUNTRY_OF_ORIGIN,
  PRODUCTS,
  descriptionFor,
  quantityFor,
  skuFor,
} from '@outlet/catalog';
import { aggregateReviews, generateReviews, reviewKindForCategory } from '@outlet/domain';
import { uploadProductImages } from './images';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes the shared catalogue (packages/catalog) into PostgreSQL. Product data
 * itself lives there so the static demo build renders the identical shop.
 */
export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  for (const brand of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      create: {
        name: brand.name,
        slug: brand.slug,
        isFeatured: brand.isFeatured,
        description: `${brand.name} outlet deals.`,
      },
      update: { isFeatured: brand.isFeatured },
    });
  }

  // Roots first so children can resolve their parent in the same pass.
  for (const category of CATEGORIES.filter((c) => c.parentSlug === null)) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { name: category.name, slug: category.slug, position: category.position },
      update: { position: category.position },
    });
  }
  for (const child of CATEGORIES.filter((c) => c.parentSlug !== null)) {
    const parent = await prisma.category.findUnique({ where: { slug: child.parentSlug! } });
    await prisma.category.upsert({
      where: { slug: child.slug },
      create: {
        name: child.name,
        slug: child.slug,
        position: child.position,
        parentId: parent?.id,
      },
      update: { parentId: parent?.id },
    });
  }

  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.slug, b]));
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));

  for (const spec of PRODUCTS) {
    const brand = brands.get(spec.brand);
    const category = categories.get(spec.category);
    if (!brand) throw new Error(`Missing brand ${spec.brand}`);

    const product = await prisma.product.upsert({
      where: { slug: spec.slug },
      create: {
        name: spec.name,
        slug: spec.slug,
        brandId: brand.id,
        categoryId: category?.id,
        shortDescription: spec.shortDescription,
        description: descriptionFor(spec),
        targetGroup: spec.targetGroup,
        materials: spec.materials,
        careInstructions: spec.careInstructions ?? DEFAULT_CARE_INSTRUCTIONS,
        countryOfOrigin: spec.countryOfOrigin ?? DEFAULT_COUNTRY_OF_ORIGIN,
        originalPriceMinor: spec.originalPriceMinor,
        outletPriceMinor: spec.outletPriceMinor,
        status: 'ACTIVE',
        publishedFrom: new Date(CATALOG_EPOCH),
        seoTitle: `${spec.name} | Outlet`,
        seoDescription: spec.shortDescription,
        searchKeywords: `${brand.name} ${spec.name} outlet sale`,
      },
      update: {},
    });

    let variantIndex = 0;
    for (const color of spec.colors) {
      for (const size of spec.sizes) {
        const sku = skuFor(spec, color, size);
        const variant = await prisma.productVariant.upsert({
          where: { sku },
          create: {
            productId: product.id,
            sku,
            size,
            color,
            position: variantIndex,
          },
          update: {},
        });

        const existingBalance = await prisma.inventoryBalance.findUnique({
          where: { variantId: variant.id },
        });
        if (!existingBalance) {
          const qty = quantityFor(spec.stock, variantIndex);
          await prisma.inventoryBalance.create({
            data: { variantId: variant.id, onHandQuantity: qty },
          });
          if (qty > 0) {
            await prisma.inventoryMovement.create({
              data: {
                variantId: variant.id,
                type: 'INITIAL',
                quantityChange: qty,
                previousOnHand: 0,
                newOnHand: qty,
                reason: 'Initial seed stock',
              },
            });
          }
        }
        variantIndex += 1;
      }
    }

    const existingImages = await prisma.productImage.count({ where: { productId: product.id } });
    if (existingImages === 0) {
      let position = 0;
      for (const color of spec.colors) {
        // Attaching each shot to a variant of its own colourway is what lets
        // the storefront swap the gallery when a colour is picked.
        const colorVariant = await prisma.productVariant.findFirst({
          where: { productId: product.id, color },
          orderBy: { position: 'asc' },
        });
        const uploaded = await uploadProductImages(spec, brand.name, color);
        // Object storage being unreachable must not leave a product with no
        // imagery at all, so fall back to one placeholder per colourway.
        const rows = uploaded.length
          ? uploaded
          : [
              {
                url: `/placeholders/${spec.slug}-${color.toLowerCase()}.svg`,
                objectKey: undefined,
                altText: `${spec.name} in ${color}`,
              },
            ];
        for (const row of rows) {
          await prisma.productImage.create({
            data: {
              productId: product.id,
              variantId: colorVariant?.id,
              url: row.url,
              objectKey: 'objectKey' in row ? row.objectKey : undefined,
              altText: row.altText,
              position,
            },
          });
          position += 1;
        }
      }
    }

    await seedReviewsFor(prisma, product.id, spec.slug, spec.category);
  }

  console.log(
    `Seeded ${BRANDS.length} brands, ${CATEGORIES.length} categories, ${PRODUCTS.length} products`,
  );
}

/**
 * Reviews come from the same deterministic generator the demo build uses, so
 * ratings match across both.
 *
 * Every rating is stored, including the majority that carry no written text —
 * that is what a real store holds, and it lets the rating histogram be computed
 * from rows rather than trusted from a counter. Only rows with a body are shown
 * as reviews.
 */
async function seedReviewsFor(
  prisma: PrismaClient,
  productId: string,
  slug: string,
  categorySlug: string,
): Promise<void> {
  const existing = await prisma.productReview.count({ where: { productId } });
  if (existing > 0) return;

  const generated = generateReviews({ slug, kind: reviewKindForCategory(categorySlug) });
  if (generated.length === 0) return;

  const aggregate = aggregateReviews(generated);

  await prisma.productReview.createMany({
    data: generated.map((review) => ({
      productId,
      authorName: review.authorName,
      rating: review.rating,
      title: review.title,
      body: review.body,
      isVerifiedPurchase: review.isVerifiedPurchase,
      helpfulCount: review.helpfulCount,
      status: 'PUBLISHED' as const,
      createdAt: new Date(Date.now() - review.daysAgo * DAY_MS),
    })),
  });

  await prisma.product.update({
    where: { id: productId },
    data: { ratingSum: aggregate.ratingSum, reviewCount: aggregate.reviewCount },
  });
}
