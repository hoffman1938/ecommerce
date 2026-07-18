import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@outlet/database';
import { discountPercent, isCampaignRunning } from '@outlet/domain';
import type {
  BrandDto,
  CategoryDto,
  Paginated,
  ProductDetailDto,
  ProductListItemDto,
} from '@outlet/types';
import type { ProductQueryInput } from '@outlet/validation';
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
        { id: c.id, name: c.name, slug: c.slug, parentId: c.parentId, position: c.position, children: [] },
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
        orderBy = Prisma.sql`(SELECT COALESCE(SUM(ib."soldQuantity"), 0) FROM "product_variants" v JOIN "inventory_balances" ib ON ib."variantId" = v."id" WHERE v."productId" = p."id") DESC`;
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
            sum + Math.max(0, (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
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
          sum + Math.max(0, (v.inventory?.onHandQuantity ?? 0) - (v.inventory?.reservedQuantity ?? 0)),
        0,
      ),
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
}
