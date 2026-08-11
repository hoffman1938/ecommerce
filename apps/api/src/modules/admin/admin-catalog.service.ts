import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@outlet/database';
import type { ProductInput, VariantInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';

type Actor = { userId: string; email: string };

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  variants: {
    orderBy: { position: 'asc' as const },
    include: { inventory: true },
  },
  campaigns: { include: { campaign: { select: { id: true, title: true, slug: true } } } },
} as const;

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listProducts(query: { q?: string; status?: string; page: number; pageSize: number }) {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createProduct(input: ProductInput, actor: Actor) {
    const exists = await this.prisma.product.findUnique({ where: { slug: input.slug } });
    if (exists) throw new ConflictException('A product with this slug already exists.');
    const product = await this.prisma.product.create({
      data: {
        ...this.productData(input),
      },
      include: PRODUCT_INCLUDE,
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'product.created',
      entityType: 'Product',
      entityId: product.id,
      after: { name: product.name, slug: product.slug },
    });
    return product;
  }

  private productData(input: ProductInput) {
    return {
      name: input.name,
      slug: input.slug,
      brandId: input.brandId,
      categoryId: input.categoryId ?? null,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      targetGroup: input.targetGroup,
      materials: input.materials ?? null,
      careInstructions: input.careInstructions ?? null,
      countryOfOrigin: input.countryOfOrigin ?? null,
      originalPriceMinor: input.originalPriceMinor,
      outletPriceMinor: input.outletPriceMinor,
      taxClass: input.taxClass,
      status: input.status,
      publishedFrom: input.publishedFrom ? new Date(input.publishedFrom) : null,
      publishedUntil: input.publishedUntil ? new Date(input.publishedUntil) : null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      searchKeywords: input.searchKeywords ?? null,
    };
  }

  async updateProduct(id: string, input: ProductInput, actor: Actor) {
    const existing = await this.getProduct(id);
    const slugTaken = await this.prisma.product.findFirst({
      where: { slug: input.slug, id: { not: id } },
    });
    if (slugTaken) throw new ConflictException('A product with this slug already exists.');
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...this.productData(input),
        archivedAt: input.status === 'ARCHIVED' ? (existing.archivedAt ?? new Date()) : null,
        version: { increment: 1 },
      },
      include: PRODUCT_INCLUDE,
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'product.updated',
      entityType: 'Product',
      entityId: id,
      before: { status: existing.status, outletPriceMinor: existing.outletPriceMinor },
      after: { status: product.status, outletPriceMinor: product.outletPriceMinor },
    });
    return product;
  }

  async duplicateProduct(id: string, actor: Actor) {
    const source = await this.getProduct(id);
    const copySlug = `${source.slug}-copy-${Date.now().toString(36)}`;
    const product = await this.prisma.product.create({
      data: {
        name: `${source.name} (copy)`,
        slug: copySlug,
        brandId: source.brandId,
        categoryId: source.categoryId,
        shortDescription: source.shortDescription,
        description: source.description,
        targetGroup: source.targetGroup,
        materials: source.materials,
        careInstructions: source.careInstructions,
        countryOfOrigin: source.countryOfOrigin,
        originalPriceMinor: source.originalPriceMinor,
        outletPriceMinor: source.outletPriceMinor,
        taxClass: source.taxClass,
        status: 'DRAFT',
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        searchKeywords: source.searchKeywords,
        variants: {
          create: source.variants.map((v, index) => ({
            sku: `${v.sku}-COPY${index}`,
            size: v.size,
            color: v.color,
            priceOverrideMinor: v.priceOverrideMinor,
            weightGrams: v.weightGrams,
            dimensions: v.dimensions,
            isEnabled: v.isEnabled,
            position: v.position,
            inventory: { create: { onHandQuantity: 0 } },
          })),
        },
      },
      include: PRODUCT_INCLUDE,
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'product.duplicated',
      entityType: 'Product',
      entityId: product.id,
      reason: `Copied from ${source.slug}`,
    });
    return product;
  }

  async archiveProduct(id: string, actor: Actor) {
    const product = await this.getProduct(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'product.archived',
      entityType: 'Product',
      entityId: id,
      before: { status: product.status },
      after: { status: 'ARCHIVED' },
    });
    return this.getProduct(id);
  }

  // --- Variants -------------------------------------------------------------

  async upsertVariant(productId: string, input: VariantInput, actor: Actor) {
    await this.getProduct(productId);
    const skuTaken = await this.prisma.productVariant.findFirst({
      where: { sku: input.sku, ...(input.id ? { id: { not: input.id } } : {}) },
    });
    if (skuTaken) throw new ConflictException(`SKU ${input.sku} is already in use.`);

    const data = {
      sku: input.sku,
      barcode: input.barcode ?? null,
      size: input.size ?? null,
      color: input.color ?? null,
      attributes: (input.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
      priceOverrideMinor: input.priceOverrideMinor ?? null,
      weightGrams: input.weightGrams ?? null,
      dimensions: input.dimensions ?? null,
      isEnabled: input.isEnabled ?? true,
    };

    let variant;
    if (input.id) {
      variant = await this.prisma.productVariant.update({
        where: { id: input.id },
        data,
        include: { inventory: true },
      });
    } else {
      variant = await this.prisma.productVariant.create({
        data: {
          ...data,
          productId,
          inventory: { create: { onHandQuantity: 0 } },
        },
        include: { inventory: true },
      });
      const initialQty = input.initialQuantity ?? 0;
      if (initialQty > 0) {
        await this.prisma.$transaction([
          this.prisma.inventoryBalance.update({
            where: { variantId: variant.id },
            data: { onHandQuantity: initialQty },
          }),
          this.prisma.inventoryMovement.create({
            data: {
              variantId: variant.id,
              type: 'INITIAL',
              quantityChange: initialQty,
              previousOnHand: 0,
              newOnHand: initialQty,
              reason: 'Initial stock at variant creation',
              actorUserId: actor.userId,
            },
          }),
        ]);
      }
    }
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: input.id ? 'variant.updated' : 'variant.created',
      entityType: 'ProductVariant',
      entityId: variant.id,
      after: { sku: variant.sku },
    });
    return variant;
  }

  async setVariantEnabled(variantId: string, isEnabled: boolean, actor: Actor) {
    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isEnabled },
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: isEnabled ? 'variant.enabled' : 'variant.disabled',
      entityType: 'ProductVariant',
      entityId: variantId,
      after: { sku: variant.sku, isEnabled },
    });
    return variant;
  }

  // --- Images ---------------------------------------------------------------

  async addImage(
    productId: string,
    image: {
      url: string;
      objectKey?: string | null;
      altText?: string | null;
      variantId?: string | null;
    },
  ) {
    await this.getProduct(productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    return this.prisma.productImage.create({
      data: {
        productId,
        url: image.url,
        objectKey: image.objectKey ?? null,
        altText: image.altText ?? null,
        variantId: image.variantId ?? null,
        position: count,
      },
    });
  }

  async reorderImages(productId: string, imageIds: string[]) {
    await this.getProduct(productId);
    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.productImage.updateMany({
          where: { id, productId },
          data: { position: index },
        }),
      ),
    );
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
    });
  }

  async deleteImage(productId: string, imageId: string) {
    await this.prisma.productImage.deleteMany({ where: { id: imageId, productId } });
  }

  // --- Brands & categories --------------------------------------------------

  async upsertBrand(
    input: {
      id?: string;
      name: string;
      slug: string;
      description?: string | null;
      isFeatured?: boolean;
      isActive?: boolean;
      logoUrl?: string | null;
    },
    actor: Actor,
  ) {
    const data = {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      isFeatured: input.isFeatured ?? false,
      isActive: input.isActive ?? true,
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    };
    const brand = input.id
      ? await this.prisma.brand.update({ where: { id: input.id }, data })
      : await this.prisma.brand.create({ data });
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: input.id ? 'brand.updated' : 'brand.created',
      entityType: 'Brand',
      entityId: brand.id,
      after: { name: brand.name },
    });
    return brand;
  }

  // Categories live in AdminCategoriesService: the tree has placement, depth,
  // ordering and delete-strategy rules that do not belong in a product service.

  // --- CSV import/export ----------------------------------------------------

  async exportProductsCsv(): Promise<string> {
    const variants = await this.prisma.productVariant.findMany({
      include: { product: { include: { brand: true, category: true } }, inventory: true },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
    });
    const header =
      'productSlug,productName,brandSlug,categorySlug,status,originalPriceMinor,outletPriceMinor,sku,size,color,onHandQuantity,reservedQuantity,isEnabled';
    const rows = variants.map((v) =>
      [
        v.product.slug,
        csvEscape(v.product.name),
        v.product.brand.slug,
        v.product.category?.slug ?? '',
        v.product.status,
        v.product.originalPriceMinor,
        v.product.outletPriceMinor,
        v.sku,
        v.size ?? '',
        v.color ?? '',
        v.inventory?.onHandQuantity ?? 0,
        v.inventory?.reservedQuantity ?? 0,
        v.isEnabled,
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Minimal CSV import (columns: productSlug,productName,brandSlug,
   * categorySlug,originalPriceMinor,outletPriceMinor,sku,size,color,
   * initialQuantity). Creates missing products/variants; never touches stock
   * of existing variants (inventory changes must go through adjustments).
   */
  async importProductsCsv(csv: string, actor: Actor) {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('CSV file has no data rows.');
    const header = lines[0].split(',').map((h) => h.trim());
    const required = ['productSlug', 'productName', 'brandSlug', 'sku'];
    for (const column of required) {
      if (!header.includes(column)) {
        throw new BadRequestException(`CSV is missing the required column "${column}".`);
      }
    }
    const index = (name: string) => header.indexOf(name);
    let created = 0;
    let skipped = 0;

    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const productSlug = cols[index('productSlug')];
      const sku = cols[index('sku')];
      if (!productSlug || !sku) {
        skipped += 1;
        continue;
      }
      const brand = await this.prisma.brand.findUnique({
        where: { slug: cols[index('brandSlug')] ?? '' },
      });
      if (!brand) {
        skipped += 1;
        continue;
      }
      const categorySlug = index('categorySlug') >= 0 ? cols[index('categorySlug')] : '';
      const category = categorySlug
        ? await this.prisma.category.findUnique({ where: { slug: categorySlug } })
        : null;

      const product = await this.prisma.product.upsert({
        where: { slug: productSlug },
        create: {
          slug: productSlug,
          name: cols[index('productName')] || productSlug,
          brandId: brand.id,
          categoryId: category?.id,
          originalPriceMinor: parseInt(cols[index('originalPriceMinor')] ?? '0', 10) || 1000,
          outletPriceMinor: parseInt(cols[index('outletPriceMinor')] ?? '0', 10) || 1000,
          status: 'DRAFT',
        },
        update: {},
      });

      const existingVariant = await this.prisma.productVariant.findUnique({ where: { sku } });
      if (existingVariant) {
        skipped += 1;
        continue;
      }
      const initialQty =
        index('initialQuantity') >= 0
          ? parseInt(cols[index('initialQuantity')] ?? '0', 10) || 0
          : 0;
      const variant = await this.prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          size: index('size') >= 0 ? cols[index('size')] || null : null,
          color: index('color') >= 0 ? cols[index('color')] || null : null,
          inventory: { create: { onHandQuantity: initialQty } },
        },
      });
      if (initialQty > 0) {
        await this.prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            type: 'INITIAL',
            quantityChange: initialQty,
            previousOnHand: 0,
            newOnHand: initialQty,
            reason: 'CSV import',
            actorUserId: actor.userId,
          },
        });
      }
      created += 1;
    }
    await this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action: 'product.csv_import',
      entityType: 'Product',
      after: { created, skipped },
    });
    return { created, skipped };
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}
