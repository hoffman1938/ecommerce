import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@outlet/database';
import { discountPercent, isCampaignRunning, ratingAverageFrom } from '@outlet/domain';
import type {
  BrandDto,
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListItemDto,
  ProductReviewsDto,
  ReviewDto,
  SearchSuggestionsDto,
} from '@outlet/types';
import type { ProductQueryInput, ReviewQueryInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';

/**
 * PostgreSQL-backed catalog search (MVP). All filtering and sorting happens
 * in one SQL id-selection query, then rows are hydrated with Prisma. The
 * service is the single entry point, so a future Meilisearch/OpenSearch
 * implementation only needs to replace `searchProductIds`.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listBrands(): Promise<BrandDto[]> {
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
    });
    return brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      logoUrl: b.logoUrl,
      isFeatured: b.isFeatured,
    }));
  }

  async listCategories(): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
    const byId = new Map<string, CategoryDto>(
      categories.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentId: c.parentId,
          position: c.position,
          children: [],
        },
      ]),
    );
    const roots: CategoryDto[] = [];
    for (const dto of byId.values()) {
      if (dto.parentId && byId.has(dto.parentId)) {
        byId.get(dto.parentId)!.children!.push(dto);
      } else {
        roots.push(dto);
      }
    }
    return roots;
  }

  private async categoryIdsIncludingChildren(slug: string): Promise<string[]> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { children: true },
    });
    if (!category) return [];
    return [category.id, ...category.children.map((c) => c.id)];
  }

  private async searchProductIds(
    query: ProductQueryInput,
  ): Promise<{ ids: string[]; total: number }> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'ACTIVE'`,
      Prisma.sql`(p."publishedFrom" IS NULL OR p."publishedFrom" <= NOW())`,
      Prisma.sql`(p."publishedUntil" IS NULL OR p."publishedUntil" > NOW())`,
    ];

    if (query.brand) {
      conditions.push(Prisma.sql`b."slug" = ${query.brand}`);
    }
    if (query.category) {
      const ids = await this.categoryIdsIncludingChildren(query.category);
      if (ids.length === 0) return { ids: [], total: 0 };
      conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join(ids)})`);
    }
    if (query.targetGroup) {
      conditions.push(Prisma.sql`p."targetGroup" = ${query.targetGroup}::"TargetGroup"`);
    }
    if (query.minPrice != null) {
      conditions.push(Prisma.sql`p."outletPriceMinor" >= ${query.minPrice}`);
    }
    if (query.maxPrice != null) {
      conditions.push(Prisma.sql`p."outletPriceMinor" <= ${query.maxPrice}`);
    }
    if (query.minDiscount != null) {
      conditions.push(
        Prisma.sql`(p."originalPriceMinor" - p."outletPriceMinor") * 100 >= ${query.minDiscount} * p."originalPriceMinor"`,
      );
    }
    if (query.minRating != null) {
      conditions.push(
        Prisma.sql`p."reviewCount" > 0 AND p."ratingSum"::float / p."reviewCount" >= ${query.minRating}`,
      );
    }
    if (query.q) {
      const like = `%${query.q}%`;
      conditions.push(
        Prisma.sql`(p."name" ILIKE ${like} OR p."shortDescription" ILIKE ${like} OR p."searchKeywords" ILIKE ${like} OR b."name" ILIKE ${like})`,
      );
    }
    if (query.size) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v WHERE v."productId" = p."id" AND v."isEnabled" = true AND v."size" = ${query.size})`,
      );
    }
    if (query.color) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v WHERE v."productId" = p."id" AND v."isEnabled" = true AND v."color" = ${query.color})`,
      );
    }
    if (query.inStock) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "product_variants" v JOIN "inventory_balances" ib ON ib."variantId" = v."id" WHERE v."productId" = p."id" AND v."isEnabled" = true AND ib."onHandQuantity" > ib."reservedQuantity")`,
      );
    }
    if (query.campaign) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "campaign_products" cp JOIN "campaigns" c ON c."id" = cp."campaignId" WHERE cp."productId" = p."id" AND c."slug" = ${query.campaign} AND c."status" = 'ACTIVE' AND c."startsAt" <= NOW() AND c."endsAt" > NOW())`,
      );
    }

    const where = Prisma.join(conditions, ' AND ');

    let orderBy: Prisma.Sql;
    switch (query.sort ?? 'recommended') {
      case 'newest':
        orderBy = Prisma.sql`p."createdAt" DESC`;
        break;
      case 'price_asc':
        orderBy = Prisma.sql`p."outletPriceMinor" ASC`;
        break;
      case 'price_desc':
        orderBy = Prisma.sql`p."outletPriceMinor" DESC`;
        break;
      case 'discount':
        orderBy = Prisma.sql`(CASE WHEN p."originalPriceMinor" > 0 THEN (p."originalPriceMinor" - p."outletPriceMinor")::float / p."originalPriceMinor" ELSE 0 END) DESC`;
        break;
      case 'popularity':
        orderBy = Prisma.sql`(SELECT COALESCE(SUM(ib."soldQuantity"), 0) FROM "product_variants" v JOIN "inventory_balances" ib ON ib."variantId" = v."id" WHERE v."productId" = p."id") DESC, p."reviewCount" DESC`;
        break;
      case 'rating':
        // Unreviewed products sort last instead of tying with 1-star ones.
        orderBy = Prisma.sql`(CASE WHEN p."reviewCount" > 0 THEN p."ratingSum"::float / p."reviewCount" ELSE -1 END) DESC, p."reviewCount" DESC`;
        break;
      case 'recommended':
      default:
        orderBy = Prisma.sql`(CASE WHEN p."originalPriceMinor" > 0 THEN (p."originalPriceMinor" - p."outletPriceMinor")::float / p."originalPriceMinor" ELSE 0 END) DESC, p."createdAt" DESC`;
        break;
    }

    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT p."id" FROM "products" p JOIN "brands" b ON b."id" = p."brandId" WHERE ${where} ORDER BY ${orderBy} LIMIT ${query.pageSize} OFFSET ${offset}`,
    );
    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "products" p JOIN "brands" b ON b."id" = p."brandId" WHERE ${where}`,
    );
    return { ids: rows.map((r) => r.id), total: Number(countRows[0]?.count ?? 0) };
  }

  async listProducts(query: ProductQueryInput): Promise<Paginated<ProductListItemDto>> {
    const { ids, total } = await this.searchProductIds(query);
    const items = await this.hydrateListItems(ids);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async hydrateListItems(ids: string[]): Promise<ProductListItemDto[]> {
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        brand: true,
        category: true,
        images: { orderBy: { position: 'asc' }, take: 1 },
        variants: { where: { isEnabled: true }, include: { inventory: true } },
        campaigns: { include: { campaign: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const now = new Date();

    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => {
        const running = p.campaigns.find(
          (cp) => cp.campaignPriceMinor != null && isCampaignRunning(cp.campaign, now),
        );
        const basePrice = p.outletPriceMinor;
        const currentPrice =
          running?.campaignPriceMinor != null && running.campaignPriceMinor < basePrice
            ? running.campaignPriceMinor
            : basePrice;
        const totalAvailable = p.variants.reduce(
          (sum, v) =>
            sum +
            Math.max(0, (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
          0,
        );
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          brand: { id: p.brand.id, name: p.brand.name, slug: p.brand.slug },
          category: p.category
            ? { id: p.category.id, name: p.category.name, slug: p.category.slug }
            : null,
          targetGroup: p.targetGroup,
          originalPriceMinor: p.originalPriceMinor,
          currentPriceMinor: currentPrice,
          discountPercent: discountPercent(p.originalPriceMinor, currentPrice),
          currencyCode: p.currencyCode,
          imageUrl: p.images[0]?.url ?? null,
          campaignId: running?.campaignId ?? null,
          campaignSlug: running ? running.campaign.slug : null,
          totalAvailable,
          ratingAverage: ratingAverageFrom(p.ratingSum, p.reviewCount),
          reviewCount: p.reviewCount,
          createdAt: p.createdAt.toISOString(),
        };
      });
  }

  async getProductBySlug(slug: string): Promise<ProductDetailDto> {
    const p = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        brand: true,
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isEnabled: true },
          orderBy: { position: 'asc' },
          include: { inventory: true },
        },
        campaigns: { include: { campaign: true } },
      },
    });
    const now = new Date();
    const published =
      p &&
      p.status === 'ACTIVE' &&
      (!p.publishedFrom || p.publishedFrom <= now) &&
      (!p.publishedUntil || p.publishedUntil > now);
    if (!p || !published) throw new NotFoundException('Product not found');

    const running = p.campaigns.find(
      (cp) => cp.campaignPriceMinor != null && isCampaignRunning(cp.campaign, now),
    );
    const currentPrice =
      running?.campaignPriceMinor != null && running.campaignPriceMinor < p.outletPriceMinor
        ? running.campaignPriceMinor
        : p.outletPriceMinor;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      brand: { id: p.brand.id, name: p.brand.name, slug: p.brand.slug },
      category: p.category
        ? { id: p.category.id, name: p.category.name, slug: p.category.slug }
        : null,
      targetGroup: p.targetGroup,
      originalPriceMinor: p.originalPriceMinor,
      currentPriceMinor: currentPrice,
      discountPercent: discountPercent(p.originalPriceMinor, currentPrice),
      currencyCode: p.currencyCode,
      imageUrl: p.images[0]?.url ?? null,
      campaignId: running?.campaignId ?? null,
      campaignSlug: running ? running.campaign.slug : null,
      totalAvailable: p.variants.reduce(
        (sum, v) =>
          sum +
          Math.max(0, (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
        0,
      ),
      ratingAverage: ratingAverageFrom(p.ratingSum, p.reviewCount),
      reviewCount: p.reviewCount,
      createdAt: p.createdAt.toISOString(),
      shortDescription: p.shortDescription,
      description: p.description,
      materials: p.materials,
      careInstructions: p.careInstructions,
      countryOfOrigin: p.countryOfOrigin,
      status: p.status,
      taxClass: p.taxClass,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      images: p.images.map((img) => ({
        id: img.id,
        url: img.url,
        altText: img.altText,
        position: img.position,
        variantId: img.variantId,
      })),
      variants: p.variants.map((v) => {
        const base = v.priceOverrideMinor ?? p.outletPriceMinor;
        const price =
          running?.campaignPriceMinor != null && running.campaignPriceMinor < base
            ? running.campaignPriceMinor
            : base;
        return {
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          size: v.size,
          color: v.color,
          priceMinor: price,
          isEnabled: v.isEnabled,
          availableQuantity: Math.max(
            0,
            (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0),
          ),
          attributes: (v.attributes as Record<string, string> | null) ?? null,
        };
      }),
    };
  }

  /**
   * Published reviews for a product, plus the aggregate the product page's
   * histogram needs. Counts come from the denormalised columns on the product
   * rather than from the returned rows: most ratings have no written body and
   * so are never stored as rows at all.
   */
  async getProductReviews(slug: string, query: ReviewQueryInput): Promise<ProductReviewsDto> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, ratingSum: true, reviewCount: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Every rating is a row; only the ones with text are shown as reviews. The
    // histogram and verified count still span all of them.
    const where = { productId: product.id, status: 'PUBLISHED' as const };
    const writtenWhere = { ...where, NOT: { body: '' } };
    const orderBy =
      query.sort === 'highest'
        ? ({ rating: 'desc' } as const)
        : query.sort === 'lowest'
          ? ({ rating: 'asc' } as const)
          : query.sort === 'helpful'
            ? ({ helpfulCount: 'desc' } as const)
            : ({ createdAt: 'desc' } as const);

    const [rows, total, grouped, verifiedCount] = await Promise.all([
      this.prisma.productReview.findMany({
        where: writtenWhere,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productReview.count({ where: writtenWhere }),
      this.prisma.productReview.groupBy({ by: ['rating'], where, _count: { rating: true } }),
      this.prisma.productReview.count({ where: { ...where, isVerifiedPurchase: true } }),
    ]);

    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const group of grouped) {
      distribution[String(group.rating)] = group._count.rating;
    }

    const items: ReviewDto[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      authorName: r.authorName,
      isVerifiedPurchase: r.isVerifiedPurchase,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      ratingAverage: ratingAverageFrom(product.ratingSum, product.reviewCount),
      reviewCount: product.reviewCount,
      distribution,
      verifiedCount,
    };
  }

  /**
   * Type-ahead suggestions. Prefix matches outrank substring matches so that
   * typing "nik" surfaces Nike products before something that merely mentions
   * Nike in its keywords.
   */
  async suggest(query: string): Promise<SearchSuggestionsDto> {
    const needle = query.trim();
    if (needle.length < 2) return { products: [], brands: [], categories: [] };

    const like = `%${needle}%`;
    const prefix = `${needle}%`;

    const [productRows, brands, categories] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT p."id"
          FROM "products" p
          JOIN "brands" b ON b."id" = p."brandId"
          WHERE p."status" = 'ACTIVE'
            AND (p."publishedFrom" IS NULL OR p."publishedFrom" <= NOW())
            AND (p."publishedUntil" IS NULL OR p."publishedUntil" > NOW())
            AND (
              p."name" ILIKE ${like}
              OR b."name" ILIKE ${like}
              OR p."searchKeywords" ILIKE ${like}
              OR EXISTS (
                SELECT 1 FROM "product_variants" v
                WHERE v."productId" = p."id" AND v."sku" ILIKE ${like}
              )
            )
          ORDER BY
            (CASE WHEN p."name" ILIKE ${prefix} THEN 0 ELSE 1 END),
            p."reviewCount" DESC,
            p."name" ASC
          LIMIT 6`,
      ),
      this.prisma.brand.findMany({
        where: { isActive: true, name: { contains: needle, mode: 'insensitive' } },
        select: { name: true, slug: true },
        orderBy: { name: 'asc' },
        take: 3,
      }),
      this.prisma.category.findMany({
        where: { isActive: true, name: { contains: needle, mode: 'insensitive' } },
        select: { name: true, slug: true },
        orderBy: { position: 'asc' },
        take: 3,
      }),
    ]);

    const products = await this.hydrateListItems(productRows.map((r) => r.id));

    return {
      products: products.map((p) => ({
        name: p.name,
        slug: p.slug,
        imageUrl: p.imageUrl,
        currentPriceMinor: p.currentPriceMinor,
      })),
      brands,
      categories,
    };
  }

  /**
   * Recommendations from browsing signals passed by the client. Falls back to
   * best-rated in-stock products for a visitor with no history.
   */
  async recommended(
    signals: { recentSlugs?: string[]; wishlistSlugs?: string[]; cartSlugs?: string[] },
    limit = 4,
  ): Promise<ProductListItemDto[]> {
    const seen = [
      ...new Set([
        ...(signals.recentSlugs ?? []),
        ...(signals.wishlistSlugs ?? []),
        ...(signals.cartSlugs ?? []),
      ]),
    ].slice(0, 20);

    const sources =
      seen.length === 0
        ? []
        : await this.prisma.product.findMany({
            where: { slug: { in: seen } },
            select: { id: true, brandId: true, categoryId: true },
          });

    const brandIds = [...new Set(sources.map((p) => p.brandId))];
    const categoryIds = [...new Set(sources.map((p) => p.categoryId).filter(Boolean))] as string[];
    const excludeIds = sources.map((p) => p.id);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT p."id"
        FROM "products" p
        WHERE p."status" = 'ACTIVE'
          AND (p."publishedFrom" IS NULL OR p."publishedFrom" <= NOW())
          AND (p."publishedUntil" IS NULL OR p."publishedUntil" > NOW())
          ${
            excludeIds.length > 0
              ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(excludeIds)})`
              : Prisma.empty
          }
          AND EXISTS (
            SELECT 1 FROM "product_variants" v
            JOIN "inventory_balances" ib ON ib."variantId" = v."id"
            WHERE v."productId" = p."id" AND ib."onHandQuantity" > ib."reservedQuantity"
          )
        ORDER BY
          (
            ${
              categoryIds.length > 0
                ? Prisma.sql`CASE WHEN p."categoryId" IN (${Prisma.join(categoryIds)}) THEN 80 ELSE 0 END`
                : Prisma.sql`0`
            }
            + ${
              brandIds.length > 0
                ? Prisma.sql`CASE WHEN p."brandId" IN (${Prisma.join(brandIds)}) THEN 50 ELSE 0 END`
                : Prisma.sql`0`
            }
            + CASE WHEN p."reviewCount" > 0 THEN p."ratingSum"::float / p."reviewCount" * 4 ELSE 0 END
          ) DESC,
          p."name" ASC
        LIMIT ${limit}`,
    );
    return this.hydrateListItems(rows.map((r) => r.id));
  }

  /**
   * "You may also like" — same category first, then same brand, ranked by
   * rating. Deterministic, and cheap enough to run per product page.
   */
  async relatedProducts(slug: string, limit = 4): Promise<ProductListItemDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, brandId: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT p."id"
        FROM "products" p
        WHERE p."status" = 'ACTIVE'
          AND p."id" <> ${product.id}
          AND (p."publishedFrom" IS NULL OR p."publishedFrom" <= NOW())
          AND (p."publishedUntil" IS NULL OR p."publishedUntil" > NOW())
        ORDER BY
          (CASE WHEN p."categoryId" = ${product.categoryId} THEN 100 ELSE 0 END
           + CASE WHEN p."brandId" = ${product.brandId} THEN 60 ELSE 0 END
           + CASE WHEN p."reviewCount" > 0 THEN p."ratingSum"::float / p."reviewCount" * 2 ELSE 0 END
          ) DESC,
          p."name" ASC
        LIMIT ${limit}`,
    );
    return this.hydrateListItems(rows.map((r) => r.id));
  }
}
