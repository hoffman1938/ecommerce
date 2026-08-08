import type { PrismaClient } from '@prisma/client';
import { uploadProductImage } from './images';

const BRANDS = [
  { name: 'Adidas', slug: 'adidas', isFeatured: true },
  { name: 'Nike', slug: 'nike', isFeatured: true },
  { name: 'Puma', slug: 'puma', isFeatured: true },
  { name: 'Tommy Hilfiger', slug: 'tommy-hilfiger', isFeatured: true },
  { name: 'Calvin Klein', slug: 'calvin-klein', isFeatured: true },
  { name: 'Levi’s', slug: 'levis', isFeatured: false },
];

const CATEGORIES = [
  { name: 'T-Shirts', slug: 't-shirts', position: 1 },
  { name: 'Shoes', slug: 'shoes', position: 2 },
  { name: 'Hoodies & Sweatshirts', slug: 'hoodies', position: 3 },
  { name: 'Jackets', slug: 'jackets', position: 4 },
  { name: 'Pants', slug: 'pants', position: 5 },
  { name: 'Accessories', slug: 'accessories', position: 6 },
];

const CHILD_CATEGORIES = [
  { name: 'Running Shoes', slug: 'running-shoes', parentSlug: 'shoes', position: 1 },
  { name: 'Sneakers', slug: 'sneakers', parentSlug: 'shoes', position: 2 },
];

type StockPlan = 'single' | 'low' | 'normal' | 'high';

interface ProductSpec {
  name: string;
  slug: string;
  skuCode: string;
  brand: string;
  category: string;
  targetGroup: 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
  originalPriceMinor: number;
  outletPriceMinor: number;
  sizes: string[];
  colors: string[];
  stock: StockPlan;
  shortDescription: string;
  materials?: string;
}

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['40', '41', '42', '43', '44'];

const PRODUCTS: ProductSpec[] = [
  {
    name: 'Adidas Essentials T-Shirt',
    slug: 'adidas-essentials-t-shirt',
    skuCode: 'ADI-ESS-TS',
    brand: 'adidas',
    category: 't-shirts',
    targetGroup: 'MEN',
    originalPriceMinor: 2995,
    outletPriceMinor: 1795,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'White'],
    stock: 'normal',
    shortDescription: 'Soft cotton everyday tee with a small chest logo.',
    materials: '100% cotton',
  },
  {
    name: 'Adidas Runfalcon Trainer',
    slug: 'adidas-runfalcon-trainer',
    skuCode: 'ADI-RNF-SH',
    brand: 'adidas',
    category: 'running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 6499,
    outletPriceMinor: 3899,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Blue'],
    stock: 'normal',
    shortDescription: 'Lightweight running shoe for daily training.',
  },
  {
    name: 'Adidas Samba Classic',
    slug: 'adidas-samba-classic',
    skuCode: 'ADI-SMB-SH',
    brand: 'adidas',
    category: 'sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 9999,
    outletPriceMinor: 6999,
    sizes: ['42'],
    colors: ['Black'],
    stock: 'single',
    shortDescription: 'Iconic low-profile sneaker — final unit in stock.',
  },
  {
    name: 'Adidas Tiro Track Pants',
    slug: 'adidas-tiro-track-pants',
    skuCode: 'ADI-TIR-PT',
    brand: 'adidas',
    category: 'pants',
    targetGroup: 'MEN',
    originalPriceMinor: 4499,
    outletPriceMinor: 2699,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Navy'],
    stock: 'high',
    shortDescription: 'Tapered training pants with zip pockets.',
  },
  {
    name: 'Adidas Trefoil Hoodie',
    slug: 'adidas-trefoil-hoodie',
    skuCode: 'ADI-TRF-HD',
    brand: 'adidas',
    category: 'hoodies',
    targetGroup: 'WOMEN',
    originalPriceMinor: 6499,
    outletPriceMinor: 3899,
    sizes: ['S', 'M', 'L'],
    colors: ['Grey', 'Pink'],
    stock: 'low',
    shortDescription: 'Fleece-lined hoodie with embroidered logo.',
  },
  {
    name: 'Nike Sportswear Club Tee',
    slug: 'nike-sportswear-club-tee',
    skuCode: 'NIK-CLB-TS',
    brand: 'nike',
    category: 't-shirts',
    targetGroup: 'MEN',
    originalPriceMinor: 2499,
    outletPriceMinor: 1499,
    sizes: CLOTHING_SIZES,
    colors: ['White', 'Navy'],
    stock: 'normal',
    shortDescription: 'Classic fit tee in midweight cotton jersey.',
    materials: '100% cotton',
  },
  {
    name: 'Nike Revolution 7 Runner',
    slug: 'nike-revolution-7-runner',
    skuCode: 'NIK-REV-SH',
    brand: 'nike',
    category: 'running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 5999,
    outletPriceMinor: 3599,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Red'],
    stock: 'normal',
    shortDescription: 'Cushioned neutral runner for everyday miles.',
  },
  {
    name: 'Nike Tech Fleece Hoodie',
    slug: 'nike-tech-fleece-hoodie',
    skuCode: 'NIK-TCH-HD',
    brand: 'nike',
    category: 'hoodies',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 6599,
    sizes: CLOTHING_SIZES,
    colors: ['Grey', 'Black'],
    stock: 'low',
    shortDescription: 'Premium smooth-face fleece with a slim fit.',
  },
  {
    name: 'Nike Windrunner Jacket',
    slug: 'nike-windrunner-jacket',
    skuCode: 'NIK-WND-JK',
    brand: 'nike',
    category: 'jackets',
    targetGroup: 'WOMEN',
    originalPriceMinor: 8999,
    outletPriceMinor: 5399,
    sizes: ['S', 'M', 'L'],
    colors: ['Blue', 'Orange'],
    stock: 'normal',
    shortDescription: 'Lightweight packable windbreaker with hood.',
  },
  {
    name: 'Nike Everyday Crew Socks 3-Pack',
    slug: 'nike-everyday-crew-socks',
    skuCode: 'NIK-SCK-AC',
    brand: 'nike',
    category: 'accessories',
    targetGroup: 'UNISEX',
    originalPriceMinor: 1499,
    outletPriceMinor: 899,
    sizes: ['One Size'],
    colors: ['White', 'Black'],
    stock: 'high',
    shortDescription: 'Cushioned crew socks, pack of three.',
  },
  {
    name: 'Puma Suede Classic XXI',
    slug: 'puma-suede-classic',
    skuCode: 'PUM-SDE-SH',
    brand: 'puma',
    category: 'sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 7999,
    outletPriceMinor: 4799,
    sizes: SHOE_SIZES,
    colors: ['Red', 'Navy'],
    stock: 'normal',
    shortDescription: 'Heritage suede sneaker with rubber sole.',
  },
  {
    name: 'Puma Essentials Logo Tee',
    slug: 'puma-essentials-logo-tee',
    skuCode: 'PUM-ESS-TS',
    brand: 'puma',
    category: 't-shirts',
    targetGroup: 'WOMEN',
    originalPriceMinor: 2299,
    outletPriceMinor: 1299,
    sizes: ['S', 'M', 'L'],
    colors: ['Pink', 'White'],
    stock: 'normal',
    shortDescription: 'Regular fit tee with printed cat logo.',
  },
  {
    name: 'Puma Training Shorts',
    slug: 'puma-training-shorts',
    skuCode: 'PUM-TRN-PT',
    brand: 'puma',
    category: 'pants',
    targetGroup: 'MEN',
    originalPriceMinor: 2999,
    outletPriceMinor: 1799,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Green'],
    stock: 'high',
    shortDescription: 'Quick-dry woven shorts with drawcord waist.',
  },
  {
    name: 'Puma Backpack Phase',
    slug: 'puma-backpack-phase',
    skuCode: 'PUM-BPK-AC',
    brand: 'puma',
    category: 'accessories',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2799,
    outletPriceMinor: 1679,
    sizes: ['One Size'],
    colors: ['Black'],
    stock: 'single',
    shortDescription: 'Compact everyday backpack — final unit in stock.',
  },
  {
    name: 'Tommy Hilfiger Flag Polo',
    slug: 'tommy-hilfiger-flag-polo',
    skuCode: 'TOM-FLG-TS',
    brand: 'tommy-hilfiger',
    category: 't-shirts',
    targetGroup: 'MEN',
    originalPriceMinor: 7999,
    outletPriceMinor: 4399,
    sizes: CLOTHING_SIZES,
    colors: ['Navy', 'White'],
    stock: 'normal',
    shortDescription: 'Slim-fit pique polo with embroidered flag.',
  },
  {
    name: 'Tommy Hilfiger Down Jacket',
    slug: 'tommy-hilfiger-down-jacket',
    skuCode: 'TOM-DWN-JK',
    brand: 'tommy-hilfiger',
    category: 'jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 24999,
    outletPriceMinor: 13749,
    sizes: ['M', 'L', 'XL'],
    colors: ['Navy', 'Black'],
    stock: 'low',
    shortDescription: 'Warm quilted down jacket with stand collar.',
  },
  {
    name: 'Tommy Hilfiger Heritage Hoodie',
    slug: 'tommy-hilfiger-heritage-hoodie',
    skuCode: 'TOM-HRT-HD',
    brand: 'tommy-hilfiger',
    category: 'hoodies',
    targetGroup: 'WOMEN',
    originalPriceMinor: 9999,
    outletPriceMinor: 5999,
    sizes: ['S', 'M', 'L'],
    colors: ['Grey', 'Navy'],
    stock: 'normal',
    shortDescription: 'Relaxed hoodie with heritage logo embroidery.',
  },
  {
    name: 'Tommy Hilfiger Leather Belt',
    slug: 'tommy-hilfiger-leather-belt',
    skuCode: 'TOM-BLT-AC',
    brand: 'tommy-hilfiger',
    category: 'accessories',
    targetGroup: 'MEN',
    originalPriceMinor: 4999,
    outletPriceMinor: 2999,
    sizes: ['90', '95', '100'],
    colors: ['Black'],
    stock: 'normal',
    shortDescription: 'Full-grain leather belt with metal buckle.',
    materials: '100% leather',
  },
  {
    name: 'Calvin Klein Modern Cotton Tee',
    slug: 'calvin-klein-modern-cotton-tee',
    skuCode: 'CKN-MDC-TS',
    brand: 'calvin-klein',
    category: 't-shirts',
    targetGroup: 'WOMEN',
    originalPriceMinor: 3999,
    outletPriceMinor: 2399,
    sizes: ['S', 'M', 'L'],
    colors: ['White', 'Black'],
    stock: 'normal',
    shortDescription: 'Minimal logo-band tee in soft stretch cotton.',
  },
  {
    name: 'Calvin Klein Jeans Slim',
    slug: 'calvin-klein-jeans-slim',
    skuCode: 'CKN-JNS-PT',
    brand: 'calvin-klein',
    category: 'pants',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 6599,
    sizes: ['30', '32', '34', '36'],
    colors: ['Blue', 'Black'],
    stock: 'normal',
    shortDescription: 'Slim jeans in comfort-stretch denim.',
  },
  {
    name: 'Calvin Klein Bomber Jacket',
    slug: 'calvin-klein-bomber-jacket',
    skuCode: 'CKN-BMB-JK',
    brand: 'calvin-klein',
    category: 'jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 17999,
    outletPriceMinor: 8999,
    sizes: ['M', 'L'],
    colors: ['Black'],
    stock: 'low',
    shortDescription: 'Clean-lined bomber with ribbed trims.',
  },
  {
    name: 'Calvin Klein Cap Institutional',
    slug: 'calvin-klein-cap',
    skuCode: 'CKN-CAP-AC',
    brand: 'calvin-klein',
    category: 'accessories',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2999,
    outletPriceMinor: 1799,
    sizes: ['One Size'],
    colors: ['Black', 'Beige'],
    stock: 'high',
    shortDescription: 'Six-panel twill cap with embroidered logo.',
  },
  {
    name: 'Levi’s 501 Original Jeans',
    slug: 'levis-501-original-jeans',
    skuCode: 'LEV-501-PT',
    brand: 'levis',
    category: 'pants',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 7699,
    sizes: ['30', '32', '34', '36'],
    colors: ['Blue'],
    stock: 'normal',
    shortDescription: 'The original straight-fit button-fly jeans.',
    materials: '100% cotton denim',
  },
];

function quantityFor(plan: StockPlan, variantIndex: number): number {
  switch (plan) {
    case 'single':
      return variantIndex === 0 ? 1 : 0;
    case 'low':
      return (variantIndex % 3) + 1; // 1..3
    case 'high':
      return 25 + variantIndex * 5;
    case 'normal':
    default:
      return 5 + (variantIndex % 4) * 3; // 5..14
  }
}

function skuFor(spec: ProductSpec, color: string, size: string): string {
  const colorCode = color
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  const sizeCode = size.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${spec.skuCode}-${colorCode}-${sizeCode}`;
}

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  for (const brand of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      create: { ...brand, description: `${brand.name} outlet deals.` },
      update: { isFeatured: brand.isFeatured },
    });
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { position: category.position },
    });
  }
  for (const child of CHILD_CATEGORIES) {
    const parent = await prisma.category.findUnique({ where: { slug: child.parentSlug } });
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

    const discountPercent = Math.round((1 - spec.outletPriceMinor / spec.originalPriceMinor) * 100);

    const product = await prisma.product.upsert({
      where: { slug: spec.slug },
      create: {
        name: spec.name,
        slug: spec.slug,
        brandId: brand.id,
        categoryId: category?.id,
        shortDescription: spec.shortDescription,
        description: `${spec.shortDescription}\n\nOutlet price — save ${discountPercent}% versus the original price. Limited quantities; sizes sell out quickly.`,
        targetGroup: spec.targetGroup,
        materials: spec.materials,
        careInstructions: 'Machine wash cold. Do not tumble dry.',
        countryOfOrigin: 'Vietnam',
        originalPriceMinor: spec.originalPriceMinor,
        outletPriceMinor: spec.outletPriceMinor,
        status: 'ACTIVE',
        publishedFrom: new Date('2026-01-01T00:00:00Z'),
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
        const uploaded = await uploadProductImage(spec.slug, brand.name, spec.name, color);
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: uploaded?.url ?? `/placeholders/${spec.slug}-${color.toLowerCase()}.svg`,
            objectKey: uploaded?.objectKey,
            altText: `${spec.name} in ${color}`,
            position,
          },
        });
        position += 1;
      }
    }
  }
  console.log(
    `Seeded ${BRANDS.length} brands, ${CATEGORIES.length + CHILD_CATEGORIES.length} categories, ${PRODUCTS.length} products`,
  );
}
