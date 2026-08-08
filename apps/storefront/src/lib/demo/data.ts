/**
 * Self-contained demo catalog for the Cloudflare Pages build.
 *
 * Cloudflare Pages serves static assets and edge functions — it cannot host the
 * NestJS API, PostgreSQL, Redis or MinIO that back the real product. To make the
 * storefront genuinely browsable when deployed there, this module reproduces the
 * Prisma seed (packages/database/src/seed/*) as plain data: the same brands,
 * categories, products, variants, stock plans, campaigns and content pages, with
 * the same derived pricing and SKU rules.
 *
 * Keep this file in sync with packages/database/src/seed when the seed changes.
 * It is only loaded when NEXT_PUBLIC_DEMO_MODE=true (see lib/demo/queries.ts).
 */

import type { TargetGroup } from '@outlet/types';

// --- Source specs (mirrored from packages/database/src/seed) ----------------

export interface DemoBrand {
  name: string;
  slug: string;
  isFeatured: boolean;
}

export const BRANDS: DemoBrand[] = [
  { name: 'Adidas', slug: 'adidas', isFeatured: true },
  { name: 'Nike', slug: 'nike', isFeatured: true },
  { name: 'Puma', slug: 'puma', isFeatured: true },
  { name: 'Tommy Hilfiger', slug: 'tommy-hilfiger', isFeatured: true },
  { name: 'Calvin Klein', slug: 'calvin-klein', isFeatured: true },
  { name: 'Levi’s', slug: 'levis', isFeatured: false },
];

export interface DemoCategory {
  name: string;
  slug: string;
  position: number;
  parentSlug: string | null;
}

export const CATEGORIES: DemoCategory[] = [
  { name: 'T-Shirts', slug: 't-shirts', position: 1, parentSlug: null },
  { name: 'Shoes', slug: 'shoes', position: 2, parentSlug: null },
  { name: 'Hoodies & Sweatshirts', slug: 'hoodies', position: 3, parentSlug: null },
  { name: 'Jackets', slug: 'jackets', position: 4, parentSlug: null },
  { name: 'Pants', slug: 'pants', position: 5, parentSlug: null },
  { name: 'Accessories', slug: 'accessories', position: 6, parentSlug: null },
  { name: 'Running Shoes', slug: 'running-shoes', position: 1, parentSlug: 'shoes' },
  { name: 'Sneakers', slug: 'sneakers', position: 2, parentSlug: 'shoes' },
];

type StockPlan = 'single' | 'low' | 'normal' | 'high';

interface ProductSpec {
  name: string;
  slug: string;
  skuCode: string;
  brand: string;
  category: string;
  targetGroup: TargetGroup;
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
  { name: 'Adidas Essentials T-Shirt', slug: 'adidas-essentials-t-shirt', skuCode: 'ADI-ESS-TS', brand: 'adidas', category: 't-shirts', targetGroup: 'MEN', originalPriceMinor: 2995, outletPriceMinor: 1795, sizes: CLOTHING_SIZES, colors: ['Black', 'White'], stock: 'normal', shortDescription: 'Soft cotton everyday tee with a small chest logo.', materials: '100% cotton' },
  { name: 'Adidas Runfalcon Trainer', slug: 'adidas-runfalcon-trainer', skuCode: 'ADI-RNF-SH', brand: 'adidas', category: 'running-shoes', targetGroup: 'UNISEX', originalPriceMinor: 6499, outletPriceMinor: 3899, sizes: SHOE_SIZES, colors: ['Black', 'Blue'], stock: 'normal', shortDescription: 'Lightweight running shoe for daily training.' },
  { name: 'Adidas Samba Classic', slug: 'adidas-samba-classic', skuCode: 'ADI-SMB-SH', brand: 'adidas', category: 'sneakers', targetGroup: 'UNISEX', originalPriceMinor: 9999, outletPriceMinor: 6999, sizes: ['42'], colors: ['Black'], stock: 'single', shortDescription: 'Iconic low-profile sneaker — final unit in stock.' },
  { name: 'Adidas Tiro Track Pants', slug: 'adidas-tiro-track-pants', skuCode: 'ADI-TIR-PT', brand: 'adidas', category: 'pants', targetGroup: 'MEN', originalPriceMinor: 4499, outletPriceMinor: 2699, sizes: CLOTHING_SIZES, colors: ['Black', 'Navy'], stock: 'high', shortDescription: 'Tapered training pants with zip pockets.' },
  { name: 'Adidas Trefoil Hoodie', slug: 'adidas-trefoil-hoodie', skuCode: 'ADI-TRF-HD', brand: 'adidas', category: 'hoodies', targetGroup: 'WOMEN', originalPriceMinor: 6499, outletPriceMinor: 3899, sizes: ['S', 'M', 'L'], colors: ['Grey', 'Pink'], stock: 'low', shortDescription: 'Fleece-lined hoodie with embroidered logo.' },
  { name: 'Nike Sportswear Club Tee', slug: 'nike-sportswear-club-tee', skuCode: 'NIK-CLB-TS', brand: 'nike', category: 't-shirts', targetGroup: 'MEN', originalPriceMinor: 2499, outletPriceMinor: 1499, sizes: CLOTHING_SIZES, colors: ['White', 'Navy'], stock: 'normal', shortDescription: 'Classic fit tee in midweight cotton jersey.', materials: '100% cotton' },
  { name: 'Nike Revolution 7 Runner', slug: 'nike-revolution-7-runner', skuCode: 'NIK-REV-SH', brand: 'nike', category: 'running-shoes', targetGroup: 'UNISEX', originalPriceMinor: 5999, outletPriceMinor: 3599, sizes: SHOE_SIZES, colors: ['Black', 'Red'], stock: 'normal', shortDescription: 'Cushioned neutral runner for everyday miles.' },
  { name: 'Nike Tech Fleece Hoodie', slug: 'nike-tech-fleece-hoodie', skuCode: 'NIK-TCH-HD', brand: 'nike', category: 'hoodies', targetGroup: 'MEN', originalPriceMinor: 10999, outletPriceMinor: 6599, sizes: CLOTHING_SIZES, colors: ['Grey', 'Black'], stock: 'low', shortDescription: 'Premium smooth-face fleece with a slim fit.' },
  { name: 'Nike Windrunner Jacket', slug: 'nike-windrunner-jacket', skuCode: 'NIK-WND-JK', brand: 'nike', category: 'jackets', targetGroup: 'WOMEN', originalPriceMinor: 8999, outletPriceMinor: 5399, sizes: ['S', 'M', 'L'], colors: ['Blue', 'Orange'], stock: 'normal', shortDescription: 'Lightweight packable windbreaker with hood.' },
  { name: 'Nike Everyday Crew Socks 3-Pack', slug: 'nike-everyday-crew-socks', skuCode: 'NIK-SCK-AC', brand: 'nike', category: 'accessories', targetGroup: 'UNISEX', originalPriceMinor: 1499, outletPriceMinor: 899, sizes: ['One Size'], colors: ['White', 'Black'], stock: 'high', shortDescription: 'Cushioned crew socks, pack of three.' },
  { name: 'Puma Suede Classic XXI', slug: 'puma-suede-classic', skuCode: 'PUM-SDE-SH', brand: 'puma', category: 'sneakers', targetGroup: 'UNISEX', originalPriceMinor: 7999, outletPriceMinor: 4799, sizes: SHOE_SIZES, colors: ['Red', 'Navy'], stock: 'normal', shortDescription: 'Heritage suede sneaker with rubber sole.' },
  { name: 'Puma Essentials Logo Tee', slug: 'puma-essentials-logo-tee', skuCode: 'PUM-ESS-TS', brand: 'puma', category: 't-shirts', targetGroup: 'WOMEN', originalPriceMinor: 2299, outletPriceMinor: 1299, sizes: ['S', 'M', 'L'], colors: ['Pink', 'White'], stock: 'normal', shortDescription: 'Regular fit tee with printed cat logo.' },
  { name: 'Puma Training Shorts', slug: 'puma-training-shorts', skuCode: 'PUM-TRN-PT', brand: 'puma', category: 'pants', targetGroup: 'MEN', originalPriceMinor: 2999, outletPriceMinor: 1799, sizes: CLOTHING_SIZES, colors: ['Black', 'Green'], stock: 'high', shortDescription: 'Quick-dry woven shorts with drawcord waist.' },
  { name: 'Puma Backpack Phase', slug: 'puma-backpack-phase', skuCode: 'PUM-BPK-AC', brand: 'puma', category: 'accessories', targetGroup: 'UNISEX', originalPriceMinor: 2799, outletPriceMinor: 1679, sizes: ['One Size'], colors: ['Black'], stock: 'single', shortDescription: 'Compact everyday backpack — final unit in stock.' },
  { name: 'Tommy Hilfiger Flag Polo', slug: 'tommy-hilfiger-flag-polo', skuCode: 'TOM-FLG-TS', brand: 'tommy-hilfiger', category: 't-shirts', targetGroup: 'MEN', originalPriceMinor: 7999, outletPriceMinor: 4399, sizes: CLOTHING_SIZES, colors: ['Navy', 'White'], stock: 'normal', shortDescription: 'Slim-fit pique polo with embroidered flag.' },
  { name: 'Tommy Hilfiger Down Jacket', slug: 'tommy-hilfiger-down-jacket', skuCode: 'TOM-DWN-JK', brand: 'tommy-hilfiger', category: 'jackets', targetGroup: 'MEN', originalPriceMinor: 24999, outletPriceMinor: 13749, sizes: ['M', 'L', 'XL'], colors: ['Navy', 'Black'], stock: 'low', shortDescription: 'Warm quilted down jacket with stand collar.' },
  { name: 'Tommy Hilfiger Heritage Hoodie', slug: 'tommy-hilfiger-heritage-hoodie', skuCode: 'TOM-HRT-HD', brand: 'tommy-hilfiger', category: 'hoodies', targetGroup: 'WOMEN', originalPriceMinor: 9999, outletPriceMinor: 5999, sizes: ['S', 'M', 'L'], colors: ['Grey', 'Navy'], stock: 'normal', shortDescription: 'Relaxed hoodie with heritage logo embroidery.' },
  { name: 'Tommy Hilfiger Leather Belt', slug: 'tommy-hilfiger-leather-belt', skuCode: 'TOM-BLT-AC', brand: 'tommy-hilfiger', category: 'accessories', targetGroup: 'MEN', originalPriceMinor: 4999, outletPriceMinor: 2999, sizes: ['90', '95', '100'], colors: ['Black'], stock: 'normal', shortDescription: 'Full-grain leather belt with metal buckle.', materials: '100% leather' },
  { name: 'Calvin Klein Modern Cotton Tee', slug: 'calvin-klein-modern-cotton-tee', skuCode: 'CKN-MDC-TS', brand: 'calvin-klein', category: 't-shirts', targetGroup: 'WOMEN', originalPriceMinor: 3999, outletPriceMinor: 2399, sizes: ['S', 'M', 'L'], colors: ['White', 'Black'], stock: 'normal', shortDescription: 'Minimal logo-band tee in soft stretch cotton.' },
  { name: 'Calvin Klein Jeans Slim', slug: 'calvin-klein-jeans-slim', skuCode: 'CKN-JNS-PT', brand: 'calvin-klein', category: 'pants', targetGroup: 'MEN', originalPriceMinor: 10999, outletPriceMinor: 6599, sizes: ['30', '32', '34', '36'], colors: ['Blue', 'Black'], stock: 'normal', shortDescription: 'Slim jeans in comfort-stretch denim.' },
  { name: 'Calvin Klein Bomber Jacket', slug: 'calvin-klein-bomber-jacket', skuCode: 'CKN-BMB-JK', brand: 'calvin-klein', category: 'jackets', targetGroup: 'MEN', originalPriceMinor: 17999, outletPriceMinor: 8999, sizes: ['M', 'L'], colors: ['Black'], stock: 'low', shortDescription: 'Clean-lined bomber with ribbed trims.' },
  { name: 'Calvin Klein Cap Institutional', slug: 'calvin-klein-cap', skuCode: 'CKN-CAP-AC', brand: 'calvin-klein', category: 'accessories', targetGroup: 'UNISEX', originalPriceMinor: 2999, outletPriceMinor: 1799, sizes: ['One Size'], colors: ['Black', 'Beige'], stock: 'high', shortDescription: 'Six-panel twill cap with embroidered logo.' },
  { name: 'Levi’s 501 Original Jeans', slug: 'levis-501-original-jeans', skuCode: 'LEV-501-PT', brand: 'levis', category: 'pants', targetGroup: 'MEN', originalPriceMinor: 10999, outletPriceMinor: 7699, sizes: ['30', '32', '34', '36'], colors: ['Blue'], stock: 'normal', shortDescription: 'The original straight-fit button-fly jeans.', materials: '100% cotton denim' },
];

interface CampaignSpec {
  title: string;
  slug: string;
  shortDescription: string;
  startsInDays: number;
  endsInDays: number;
  productSlugs: string[];
  extraDiscountPercent: number;
  position: number;
}

const CAMPAIGNS: CampaignSpec[] = [
  { title: 'Adidas Outlet Sale', slug: 'adidas-outlet-sale', shortDescription: 'Up to 45% off Adidas essentials, footwear, and more.', startsInDays: -1, endsInDays: 5, extraDiscountPercent: 10, position: 1, productSlugs: ['adidas-essentials-t-shirt', 'adidas-runfalcon-trainer', 'adidas-samba-classic', 'adidas-tiro-track-pants', 'adidas-trefoil-hoodie'] },
  { title: 'Summer Shoes Sale', slug: 'summer-shoes-sale', shortDescription: 'Sneakers and runners for the season at outlet prices.', startsInDays: -2, endsInDays: 4, extraDiscountPercent: 5, position: 2, productSlugs: ['nike-revolution-7-runner', 'puma-suede-classic', 'adidas-runfalcon-trainer'] },
  { title: 'Sportswear Weekend', slug: 'sportswear-weekend', shortDescription: 'Weekend-only deals on training gear and fleece.', startsInDays: 0, endsInDays: 3, extraDiscountPercent: 15, position: 3, productSlugs: ['nike-tech-fleece-hoodie', 'puma-training-shorts', 'nike-sportswear-club-tee', 'adidas-tiro-track-pants'] },
  { title: 'Up to 60% Off Nike', slug: 'up-to-60-off-nike', shortDescription: 'The big Nike drop is coming — up to 60% off.', startsInDays: 3, endsInDays: 10, extraDiscountPercent: 20, position: 4, productSlugs: ['nike-sportswear-club-tee', 'nike-revolution-7-runner', 'nike-windrunner-jacket', 'nike-everyday-crew-socks'] },
  { title: 'Designer Accessories Sale', slug: 'designer-accessories-sale', shortDescription: 'Belts, caps, and bags from premium brands.', startsInDays: 5, endsInDays: 12, extraDiscountPercent: 10, position: 5, productSlugs: ['tommy-hilfiger-leather-belt', 'calvin-klein-cap', 'puma-backpack-phase'] },
];

export const CONTENT_PAGES: Array<{ key: string; title: string; body: string }> = [
  { key: 'privacy_policy', title: 'Privacy Policy', body: 'This is placeholder privacy policy content for the demo environment. Replace it with your real policy before any production launch.\n\nWe store account details (name, email), order history, and addresses to fulfil orders. Demo data never leaves your browser.' },
  { key: 'terms', title: 'Terms and Conditions', body: 'Placeholder terms and conditions for the demo environment.\n\n1. Orders are only confirmed after successful payment.\n2. Reserved items are held for a limited time (20 minutes by default).\n3. Returns are accepted within 30 days of delivery.' },
  { key: 'cookie_policy', title: 'Cookie Policy', body: 'This shop uses strictly necessary storage only: a browser-local cart that keeps your basket between visits. No tracking or marketing cookies are set in the demo build.' },
  { key: 'faq', title: 'Frequently Asked Questions', body: 'Q: How long are items reserved in my cart?\nA: 20 minutes by default. The countdown is shown in the cart.\n\nQ: When do campaigns end?\nA: Each campaign shows its end time on the campaign page.\n\nQ: How do returns work?\nA: Request a return from your order page after delivery; refunds are issued after the returned items are inspected.' },
  { key: 'shipping_info', title: 'Shipping Information', body: 'Standard shipping: 3-5 business days (4.95).\nExpress shipping: 1-2 business days (9.95).\nOrders over 100.00 ship free with standard shipping.\n\nDemo note: no real shipments are created.' },
  { key: 'returns_info', title: 'Returns', body: 'You can request a return for delivered items within 30 days. Once your return is approved and received, refunds are issued to the original payment method within 5-10 business days.' },
  { key: 'contact_info', title: 'Contact', body: 'Outlet Marketplace (demo deployment)\nEmail: support@outlet.local\n\nThis is a static demo of the storefront running on Cloudflare Pages.' },
];

export const SETTINGS = {
  reservationDurationMinutes: 20,
  lowStockThreshold: 5,
  standardShippingMinor: 495,
  expressShippingMinor: 995,
  freeShippingThresholdMinor: 10000,
  taxRateBps: 2000,
};

export const CURRENCY_CODE = 'EUR';

// --- Derivation rules (identical to the seed) -------------------------------

function quantityFor(plan: StockPlan, variantIndex: number): number {
  switch (plan) {
    case 'single':
      return variantIndex === 0 ? 1 : 0;
    case 'low':
      return (variantIndex % 3) + 1;
    case 'high':
      return 25 + variantIndex * 5;
    case 'normal':
    default:
      return 5 + (variantIndex % 4) * 3;
  }
}

function skuFor(spec: ProductSpec, color: string, size: string): string {
  const colorCode = color.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5);
  const sizeCode = size.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${spec.skuCode}-${colorCode}-${sizeCode}`;
}

// --- Placeholder imagery (inline SVG data URIs, no object storage needed) ----

const COLOR_HEX: Record<string, string> = {
  Black: '#1f2937',
  White: '#e5e7eb',
  Red: '#dc2626',
  Blue: '#2563eb',
  Navy: '#1e3a5f',
  Green: '#16a34a',
  Grey: '#6b7280',
  Beige: '#d6c7a1',
  Pink: '#ec4899',
  Orange: '#ea580c',
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function productImageUri(brandName: string, productName: string, color: string): string {
  const bg = COLOR_HEX[color] ?? '#9ca3af';
  const fg = color === 'White' || color === 'Beige' ? '#111827' : '#ffffff';
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">` +
      `<rect width="800" height="800" fill="${bg}"/>` +
      `<rect x="60" y="60" width="680" height="680" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="4"/>` +
      `<text x="400" y="360" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="${fg}" text-anchor="middle">${escapeXml(brandName)}</text>` +
      `<text x="400" y="440" font-family="Arial, sans-serif" font-size="34" fill="${fg}" fill-opacity="0.9" text-anchor="middle">${escapeXml(productName)}</text>` +
      `<text x="400" y="500" font-family="Arial, sans-serif" font-size="28" fill="${fg}" fill-opacity="0.7" text-anchor="middle">${escapeXml(color)}</text>` +
      `</svg>`,
  );
}

function campaignImageUri(title: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#4b5563"/>` +
      `</linearGradient></defs>` +
      `<rect width="1200" height="500" fill="url(#g)"/>` +
      `<text x="600" y="250" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(title)}</text>` +
      `<text x="600" y="320" font-family="Arial, sans-serif" font-size="30" fill="#d1d5db" text-anchor="middle">Limited stock. Limited time.</text>` +
      `</svg>`,
  );
}

// --- Materialised records ---------------------------------------------------

export interface DemoVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  position: number;
  onHandQuantity: number;
}

export interface DemoImage {
  id: string;
  url: string;
  altText: string;
  position: number;
}

export interface DemoProduct {
  id: string;
  name: string;
  slug: string;
  brandSlug: string;
  categorySlug: string;
  targetGroup: TargetGroup;
  originalPriceMinor: number;
  outletPriceMinor: number;
  shortDescription: string;
  description: string;
  materials: string | null;
  careInstructions: string;
  countryOfOrigin: string;
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
  createdAt: string;
  variants: DemoVariant[];
  images: DemoImage[];
  totalAvailable: number;
}

export interface DemoCampaign {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  coverImageUrl: string;
  startsInDays: number;
  endsInDays: number;
  position: number;
  extraDiscountPercent: number;
  /** productSlug -> campaign price in minor units */
  prices: Record<string, number>;
}

export const brandBySlug = new Map<string, DemoBrand>(BRANDS.map((b) => [b.slug, b] as const));
export const categoryBySlug = new Map<string, DemoCategory>(
  CATEGORIES.map((c) => [c.slug, c] as const),
);

/** Base date used for `createdAt`; matches the seed's publishedFrom. */
const CREATED_BASE = Date.parse('2026-01-01T00:00:00Z');

export const PRODUCT_LIST: DemoProduct[] = PRODUCTS.map((spec, productIndex) => {
  const brand = brandBySlug.get(spec.brand)!;
  const discountPercent = Math.round((1 - spec.outletPriceMinor / spec.originalPriceMinor) * 100);

  const variants: DemoVariant[] = [];
  let variantIndex = 0;
  for (const color of spec.colors) {
    for (const size of spec.sizes) {
      variants.push({
        id: `var_${skuFor(spec, color, size)}`,
        sku: skuFor(spec, color, size),
        size,
        color,
        position: variantIndex,
        onHandQuantity: quantityFor(spec.stock, variantIndex),
      });
      variantIndex += 1;
    }
  }

  const images: DemoImage[] = spec.colors.map((color, position) => ({
    id: `img_${spec.slug}_${position}`,
    url: productImageUri(brand.name, spec.name, color),
    altText: `${spec.name} in ${color}`,
    position,
  }));

  return {
    id: `prod_${spec.slug}`,
    name: spec.name,
    slug: spec.slug,
    brandSlug: spec.brand,
    categorySlug: spec.category,
    targetGroup: spec.targetGroup,
    originalPriceMinor: spec.originalPriceMinor,
    outletPriceMinor: spec.outletPriceMinor,
    shortDescription: spec.shortDescription,
    description: `${spec.shortDescription}\n\nOutlet price — save ${discountPercent}% versus the original price. Limited quantities; sizes sell out quickly.`,
    materials: spec.materials ?? null,
    careInstructions: 'Machine wash cold. Do not tumble dry.',
    countryOfOrigin: 'Vietnam',
    seoTitle: `${spec.name} | Outlet`,
    seoDescription: spec.shortDescription,
    searchKeywords: `${brand.name} ${spec.name} outlet sale`,
    // Stagger createdAt so "newest" sorting is stable and meaningful.
    createdAt: new Date(CREATED_BASE + productIndex * 3_600_000).toISOString(),
    variants,
    images,
    totalAvailable: variants.reduce((sum, v) => sum + v.onHandQuantity, 0),
  };
});

export const productBySlug = new Map<string, DemoProduct>(
  PRODUCT_LIST.map((p) => [p.slug, p] as const),
);

export const CAMPAIGN_LIST: DemoCampaign[] = CAMPAIGNS.map((spec) => {
  const prices: Record<string, number> = {};
  for (const slug of spec.productSlugs) {
    const product = productBySlug.get(slug);
    if (!product) continue;
    prices[slug] = Math.max(
      100,
      Math.round((product.outletPriceMinor * (100 - spec.extraDiscountPercent)) / 100),
    );
  }
  return {
    id: `camp_${spec.slug}`,
    title: spec.title,
    slug: spec.slug,
    shortDescription: spec.shortDescription,
    description: `${spec.shortDescription}\n\nCampaign prices apply only while the campaign is running and stocks last.`,
    coverImageUrl: campaignImageUri(spec.title),
    startsInDays: spec.startsInDays,
    endsInDays: spec.endsInDays,
    position: spec.position,
    extraDiscountPercent: spec.extraDiscountPercent,
    prices,
  };
});

export const campaignBySlug = new Map<string, DemoCampaign>(
  CAMPAIGN_LIST.map((c) => [c.slug, c] as const),
);
