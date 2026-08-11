/**
 * The outlet catalogue, as data.
 *
 * This is the single source of truth for brands, categories, products,
 * campaigns, content pages and store settings. Two very different consumers
 * read it:
 *
 *  - packages/database/src/seed — writes it into PostgreSQL for the real stack.
 *  - apps/storefront/src/lib/demo — materialises it in the browser for the
 *    static Cloudflare Pages export, which has no backend to talk to.
 *
 * Both used to keep their own copy and drift apart. Keeping the specs here
 * means a catalogue change lands in both at once.
 */

import type { TargetGroup } from '@outlet/types';
import { CATEGORY_NODES, type CategoryNodeSpec } from './taxonomy';

export interface BrandSpec {
  name: string;
  slug: string;
  isFeatured: boolean;
}

export const BRANDS: BrandSpec[] = [
  { name: 'Adidas', slug: 'adidas', isFeatured: true },
  { name: 'Nike', slug: 'nike', isFeatured: true },
  { name: 'Puma', slug: 'puma', isFeatured: true },
  { name: 'Tommy Hilfiger', slug: 'tommy-hilfiger', isFeatured: true },
  { name: 'Calvin Klein', slug: 'calvin-klein', isFeatured: true },
  { name: 'Levi’s', slug: 'levis', isFeatured: false },
  { name: 'New Balance', slug: 'new-balance', isFeatured: true },
  { name: 'The North Face', slug: 'the-north-face', isFeatured: true },
  { name: 'Lacoste', slug: 'lacoste', isFeatured: false },
  { name: 'Champion', slug: 'champion', isFeatured: false },
];

/**
 * The shipped category rows.
 *
 * Derived from ./taxonomy rather than declared twice — the seed, the artwork
 * generator and the static demo build all read this, and a second hand-written
 * list is exactly how the tree and the products drifted apart before.
 */
export type CategorySpec = CategoryNodeSpec;

export const CATEGORIES: CategorySpec[] = CATEGORY_NODES;

export type StockPlan = 'sold-out' | 'single' | 'low' | 'normal' | 'high';

/**
 * The silhouette drawn for a product's generated artwork. Chosen per product
 * rather than derived from the category so, say, a padded gilet and a parka can
 * look different while sharing a category.
 */
export type ProductShape =
  | 'tee'
  | 'polo'
  | 'hoodie'
  | 'jacket'
  | 'pants'
  | 'shorts'
  | 'sneaker'
  | 'runner'
  | 'boot'
  | 'backpack'
  | 'shoulder-bag'
  | 'cap'
  | 'belt'
  | 'socks'
  | 'wallet'
  | 'scarf';

export interface ProductSpec {
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
  shape: ProductShape;
  shortDescription: string;
  materials?: string;
  /** Overrides the default care line where it would be wrong (leather, down). */
  careInstructions?: string;
  countryOfOrigin?: string;
}

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['40', '41', '42', '43', '44'];
const WAIST_SIZES = ['30', '32', '34', '36'];
const ONE_SIZE = ['One Size'];

/**
 * Childrenswear is sized by age, and footwear by EU number in a range that
 * cannot overlap the adult one — otherwise a "34" in the size filter would mean
 * two different feet depending on which product you were looking at.
 */
const KIDS_CLOTHING_SIZES = ['4Y', '6Y', '8Y', '10Y', '12Y'];
const KIDS_SHOE_SIZES = ['28', '30', '32', '34'];

/**
 * Discounts are deliberately uneven — roughly a third sit under 30% — so the
 * catalogue does not read as uniformly half-price, which is the fastest way to
 * make an outlet look fake.
 */
export const PRODUCTS: ProductSpec[] = [
  // --- Adidas ---------------------------------------------------------------
  {
    name: 'Adidas Essentials T-Shirt',
    slug: 'adidas-essentials-t-shirt',
    skuCode: 'ADI-ESS-TS',
    brand: 'adidas',
    category: 'men-t-shirts',
    targetGroup: 'MEN',
    originalPriceMinor: 2995,
    outletPriceMinor: 1795,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'White'],
    stock: 'normal',
    shape: 'tee',
    shortDescription: 'Soft cotton everyday tee with a small chest logo.',
    materials: '100% cotton',
  },
  {
    name: 'Adidas Runfalcon Trainer',
    slug: 'adidas-runfalcon-trainer',
    skuCode: 'ADI-RNF-SH',
    brand: 'adidas',
    category: 'unisex-running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 6499,
    outletPriceMinor: 3899,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Blue'],
    stock: 'normal',
    shape: 'runner',
    shortDescription: 'Lightweight running shoe for daily training.',
  },
  {
    name: 'Adidas Samba Classic',
    slug: 'adidas-samba-classic',
    skuCode: 'ADI-SMB-SH',
    brand: 'adidas',
    category: 'unisex-sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 9999,
    outletPriceMinor: 6999,
    sizes: ['42'],
    colors: ['Black'],
    stock: 'single',
    shape: 'sneaker',
    shortDescription: 'Iconic low-profile sneaker — final unit in stock.',
  },
  {
    name: 'Adidas Tiro Track Pants',
    slug: 'adidas-tiro-track-pants',
    skuCode: 'ADI-TIR-PT',
    brand: 'adidas',
    category: 'men-trousers',
    targetGroup: 'MEN',
    originalPriceMinor: 4499,
    outletPriceMinor: 2699,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Navy'],
    stock: 'high',
    shape: 'pants',
    shortDescription: 'Tapered training pants with zip pockets.',
  },
  {
    name: 'Adidas Trefoil Hoodie',
    slug: 'adidas-trefoil-hoodie',
    skuCode: 'ADI-TRF-HD',
    brand: 'adidas',
    category: 'women-hoodies',
    targetGroup: 'WOMEN',
    originalPriceMinor: 6499,
    outletPriceMinor: 3899,
    sizes: ['S', 'M', 'L'],
    colors: ['Grey', 'Pink'],
    stock: 'low',
    shape: 'hoodie',
    shortDescription: 'Fleece-lined hoodie with embroidered logo.',
  },
  {
    name: 'Adidas Terrex Hiking Boot',
    slug: 'adidas-terrex-hiking-boot',
    skuCode: 'ADI-TRX-BT',
    brand: 'adidas',
    category: 'unisex-boots',
    targetGroup: 'UNISEX',
    originalPriceMinor: 13999,
    outletPriceMinor: 9799,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Green'],
    stock: 'low',
    shape: 'boot',
    shortDescription: 'Waterproof mid-cut hiking boot with grippy outsole.',
    materials: 'Synthetic upper, rubber outsole',
    careInstructions: 'Wipe clean with a damp cloth. Re-proof seasonally.',
  },
  {
    name: 'Adidas Linear Duffel Bag',
    slug: 'adidas-linear-duffel-bag',
    skuCode: 'ADI-DFL-BG',
    brand: 'adidas',
    category: 'unisex-bags',
    targetGroup: 'UNISEX',
    originalPriceMinor: 3499,
    outletPriceMinor: 2449,
    sizes: ONE_SIZE,
    colors: ['Black', 'Navy'],
    stock: 'normal',
    shape: 'shoulder-bag',
    shortDescription: 'Gym duffel with a wet compartment and shoulder strap.',
  },
  {
    name: 'Adidas Adicolor Track Jacket',
    slug: 'adidas-adicolor-track-jacket',
    skuCode: 'ADI-ADC-JK',
    brand: 'adidas',
    category: 'women-jackets',
    targetGroup: 'WOMEN',
    originalPriceMinor: 7499,
    outletPriceMinor: 4499,
    sizes: ['S', 'M', 'L'],
    colors: ['Black', 'Red'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'Retro track top with contrast three-stripe sleeves.',
  },

  // --- Nike -----------------------------------------------------------------
  {
    name: 'Nike Sportswear Club Tee',
    slug: 'nike-sportswear-club-tee',
    skuCode: 'NIK-CLB-TS',
    brand: 'nike',
    category: 'men-t-shirts',
    targetGroup: 'MEN',
    originalPriceMinor: 2499,
    outletPriceMinor: 1499,
    sizes: CLOTHING_SIZES,
    colors: ['White', 'Navy'],
    stock: 'normal',
    shape: 'tee',
    shortDescription: 'Classic fit tee in midweight cotton jersey.',
    materials: '100% cotton',
  },
  {
    name: 'Nike Revolution 7 Runner',
    slug: 'nike-revolution-7-runner',
    skuCode: 'NIK-REV-SH',
    brand: 'nike',
    category: 'unisex-running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 5999,
    outletPriceMinor: 3599,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Red'],
    stock: 'normal',
    shape: 'runner',
    shortDescription: 'Cushioned neutral runner for everyday miles.',
  },
  {
    name: 'Nike Tech Fleece Hoodie',
    slug: 'nike-tech-fleece-hoodie',
    skuCode: 'NIK-TCH-HD',
    brand: 'nike',
    category: 'men-hoodies',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 6599,
    sizes: CLOTHING_SIZES,
    colors: ['Grey', 'Black'],
    stock: 'low',
    shape: 'hoodie',
    shortDescription: 'Premium smooth-face fleece with a slim fit.',
  },
  {
    name: 'Nike Windrunner Jacket',
    slug: 'nike-windrunner-jacket',
    skuCode: 'NIK-WND-JK',
    brand: 'nike',
    category: 'women-jackets',
    targetGroup: 'WOMEN',
    originalPriceMinor: 8999,
    outletPriceMinor: 5399,
    sizes: ['S', 'M', 'L'],
    colors: ['Blue', 'Orange'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'Lightweight packable windbreaker with hood.',
  },
  {
    name: 'Nike Everyday Crew Socks 3-Pack',
    slug: 'nike-everyday-crew-socks',
    skuCode: 'NIK-SCK-AC',
    brand: 'nike',
    category: 'unisex-socks',
    targetGroup: 'UNISEX',
    originalPriceMinor: 1499,
    outletPriceMinor: 899,
    sizes: ONE_SIZE,
    colors: ['White', 'Black'],
    stock: 'high',
    shape: 'socks',
    shortDescription: 'Cushioned crew socks, pack of three.',
  },
  {
    name: 'Nike Air Zoom Pegasus 40',
    slug: 'nike-air-zoom-pegasus-40',
    skuCode: 'NIK-PEG-SH',
    brand: 'nike',
    category: 'unisex-running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 13999,
    outletPriceMinor: 9099,
    sizes: SHOE_SIZES,
    colors: ['Blue', 'Black'],
    stock: 'low',
    shape: 'runner',
    shortDescription: 'Responsive daily trainer with dual Air Zoom units.',
  },
  {
    name: 'Nike Brasilia Training Backpack',
    slug: 'nike-brasilia-backpack',
    skuCode: 'NIK-BRS-BG',
    brand: 'nike',
    category: 'unisex-backpacks',
    targetGroup: 'UNISEX',
    originalPriceMinor: 4499,
    outletPriceMinor: 3149,
    sizes: ONE_SIZE,
    colors: ['Black', 'Grey'],
    stock: 'normal',
    shape: 'backpack',
    shortDescription: '24 L training pack with a ventilated shoe compartment.',
  },
  {
    name: 'Nike Dri-FIT Training Shorts',
    slug: 'nike-dri-fit-training-shorts',
    skuCode: 'NIK-DRI-PT',
    brand: 'nike',
    category: 'men-shorts',
    targetGroup: 'MEN',
    originalPriceMinor: 3299,
    outletPriceMinor: 2299,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Grey'],
    stock: 'high',
    shape: 'shorts',
    shortDescription: 'Sweat-wicking 7" shorts with a zip back pocket.',
  },
  {
    name: 'Nike Heritage86 Cap',
    slug: 'nike-heritage86-cap',
    skuCode: 'NIK-H86-AC',
    brand: 'nike',
    category: 'unisex-hats',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2299,
    outletPriceMinor: 1839,
    sizes: ONE_SIZE,
    colors: ['White', 'Black', 'Navy'],
    stock: 'normal',
    shape: 'cap',
    shortDescription: 'Unstructured cotton cap with a curved brim.',
    materials: '100% cotton twill',
  },

  // --- Puma -----------------------------------------------------------------
  {
    name: 'Puma Suede Classic XXI',
    slug: 'puma-suede-classic',
    skuCode: 'PUM-SDE-SH',
    brand: 'puma',
    category: 'unisex-sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 7999,
    outletPriceMinor: 4799,
    sizes: SHOE_SIZES,
    colors: ['Red', 'Navy'],
    stock: 'normal',
    shape: 'sneaker',
    shortDescription: 'Heritage suede sneaker with rubber sole.',
  },
  {
    name: 'Puma Essentials Logo Tee',
    slug: 'puma-essentials-logo-tee',
    skuCode: 'PUM-ESS-TS',
    brand: 'puma',
    category: 'women-t-shirts',
    targetGroup: 'WOMEN',
    originalPriceMinor: 2299,
    outletPriceMinor: 1299,
    sizes: ['S', 'M', 'L'],
    colors: ['Pink', 'White'],
    stock: 'normal',
    shape: 'tee',
    shortDescription: 'Regular fit tee with printed cat logo.',
  },
  {
    name: 'Puma Training Shorts',
    slug: 'puma-training-shorts',
    skuCode: 'PUM-TRN-PT',
    brand: 'puma',
    category: 'men-shorts',
    targetGroup: 'MEN',
    originalPriceMinor: 2999,
    outletPriceMinor: 1799,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Green'],
    stock: 'high',
    shape: 'shorts',
    shortDescription: 'Quick-dry woven shorts with drawcord waist.',
  },
  {
    name: 'Puma Backpack Phase',
    slug: 'puma-backpack-phase',
    skuCode: 'PUM-BPK-AC',
    brand: 'puma',
    category: 'unisex-backpacks',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2799,
    outletPriceMinor: 1679,
    sizes: ONE_SIZE,
    colors: ['Black'],
    stock: 'single',
    shape: 'backpack',
    shortDescription: 'Compact everyday backpack — final unit in stock.',
  },
  {
    name: 'Puma RS-X Reinvention',
    slug: 'puma-rs-x-reinvention',
    skuCode: 'PUM-RSX-SH',
    brand: 'puma',
    category: 'unisex-sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 11999,
    outletPriceMinor: 5999,
    sizes: SHOE_SIZES,
    colors: ['White', 'Blue'],
    stock: 'normal',
    shape: 'sneaker',
    shortDescription: 'Chunky retro-runner silhouette with bold blocking.',
  },
  {
    name: 'Puma Teamgoal Zip Hoodie',
    slug: 'puma-teamgoal-zip-hoodie',
    skuCode: 'PUM-TGL-HD',
    brand: 'puma',
    category: 'men-hoodies',
    targetGroup: 'MEN',
    originalPriceMinor: 5499,
    outletPriceMinor: 3849,
    sizes: CLOTHING_SIZES,
    colors: ['Navy', 'Black'],
    stock: 'normal',
    shape: 'hoodie',
    shortDescription: 'Full-zip training hoodie in brushed fleece.',
  },

  // --- Tommy Hilfiger -------------------------------------------------------
  {
    name: 'Tommy Hilfiger Flag Polo',
    slug: 'tommy-hilfiger-flag-polo',
    skuCode: 'TOM-FLG-TS',
    brand: 'tommy-hilfiger',
    category: 'men-polos',
    targetGroup: 'MEN',
    originalPriceMinor: 7999,
    outletPriceMinor: 4399,
    sizes: CLOTHING_SIZES,
    colors: ['Navy', 'White'],
    stock: 'normal',
    shape: 'polo',
    shortDescription: 'Slim-fit pique polo with embroidered flag.',
  },
  {
    name: 'Tommy Hilfiger Down Jacket',
    slug: 'tommy-hilfiger-down-jacket',
    skuCode: 'TOM-DWN-JK',
    brand: 'tommy-hilfiger',
    category: 'men-jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 24999,
    outletPriceMinor: 13749,
    sizes: ['M', 'L', 'XL'],
    colors: ['Navy', 'Black'],
    stock: 'low',
    shape: 'jacket',
    shortDescription: 'Warm quilted down jacket with stand collar.',
    careInstructions: 'Tumble dry low with dryer balls to reloft the down.',
  },
  {
    name: 'Tommy Hilfiger Heritage Hoodie',
    slug: 'tommy-hilfiger-heritage-hoodie',
    skuCode: 'TOM-HRT-HD',
    brand: 'tommy-hilfiger',
    category: 'women-hoodies',
    targetGroup: 'WOMEN',
    originalPriceMinor: 9999,
    outletPriceMinor: 5999,
    sizes: ['S', 'M', 'L'],
    colors: ['Grey', 'Navy'],
    stock: 'normal',
    shape: 'hoodie',
    shortDescription: 'Relaxed hoodie with heritage logo embroidery.',
  },
  {
    name: 'Tommy Hilfiger Leather Belt',
    slug: 'tommy-hilfiger-leather-belt',
    skuCode: 'TOM-BLT-AC',
    brand: 'tommy-hilfiger',
    category: 'men-belts',
    targetGroup: 'MEN',
    originalPriceMinor: 4999,
    outletPriceMinor: 2999,
    sizes: ['90', '95', '100'],
    colors: ['Black'],
    stock: 'normal',
    shape: 'belt',
    shortDescription: 'Full-grain leather belt with metal buckle.',
    materials: '100% leather',
    careInstructions: 'Wipe with a dry cloth. Do not machine wash.',
  },
  {
    name: 'Tommy Hilfiger Chino Trousers',
    slug: 'tommy-hilfiger-chino-trousers',
    skuCode: 'TOM-CHN-PT',
    brand: 'tommy-hilfiger',
    category: 'men-trousers',
    targetGroup: 'MEN',
    originalPriceMinor: 9999,
    outletPriceMinor: 6499,
    sizes: WAIST_SIZES,
    colors: ['Beige', 'Navy'],
    stock: 'normal',
    shape: 'pants',
    shortDescription: 'Straight-leg cotton chinos with a clean finish.',
    materials: '98% cotton, 2% elastane',
  },
  {
    name: 'Tommy Hilfiger Crossbody Bag',
    slug: 'tommy-hilfiger-crossbody-bag',
    skuCode: 'TOM-CRB-BG',
    brand: 'tommy-hilfiger',
    category: 'women-bags',
    targetGroup: 'WOMEN',
    originalPriceMinor: 8999,
    outletPriceMinor: 5399,
    sizes: ONE_SIZE,
    colors: ['Black', 'Beige'],
    stock: 'low',
    shape: 'shoulder-bag',
    shortDescription: 'Structured crossbody with an adjustable webbing strap.',
    careInstructions: 'Wipe with a dry cloth. Do not machine wash.',
  },

  // --- Calvin Klein ---------------------------------------------------------
  {
    name: 'Calvin Klein Modern Cotton Tee',
    slug: 'calvin-klein-modern-cotton-tee',
    skuCode: 'CKN-MDC-TS',
    brand: 'calvin-klein',
    category: 'women-t-shirts',
    targetGroup: 'WOMEN',
    originalPriceMinor: 3999,
    outletPriceMinor: 2399,
    sizes: ['S', 'M', 'L'],
    colors: ['White', 'Black'],
    stock: 'normal',
    shape: 'tee',
    shortDescription: 'Minimal logo-band tee in soft stretch cotton.',
  },
  {
    name: 'Calvin Klein Jeans Slim',
    slug: 'calvin-klein-jeans-slim',
    skuCode: 'CKN-JNS-PT',
    brand: 'calvin-klein',
    category: 'men-jeans',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 6599,
    sizes: WAIST_SIZES,
    colors: ['Blue', 'Black'],
    stock: 'normal',
    shape: 'pants',
    shortDescription: 'Slim jeans in comfort-stretch denim.',
  },
  {
    name: 'Calvin Klein Bomber Jacket',
    slug: 'calvin-klein-bomber-jacket',
    skuCode: 'CKN-BMB-JK',
    brand: 'calvin-klein',
    category: 'men-jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 17999,
    outletPriceMinor: 8999,
    sizes: ['M', 'L'],
    colors: ['Black'],
    stock: 'low',
    shape: 'jacket',
    shortDescription: 'Clean-lined bomber with ribbed trims.',
  },
  {
    name: 'Calvin Klein Cap Institutional',
    slug: 'calvin-klein-cap',
    skuCode: 'CKN-CAP-AC',
    brand: 'calvin-klein',
    category: 'unisex-hats',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2999,
    outletPriceMinor: 1799,
    sizes: ONE_SIZE,
    colors: ['Black', 'Beige'],
    stock: 'high',
    shape: 'cap',
    shortDescription: 'Six-panel twill cap with embroidered logo.',
  },
  {
    name: 'Calvin Klein Leather Cardholder',
    slug: 'calvin-klein-leather-cardholder',
    skuCode: 'CKN-CRD-AC',
    brand: 'calvin-klein',
    category: 'unisex-wallets',
    targetGroup: 'UNISEX',
    originalPriceMinor: 4499,
    outletPriceMinor: 3149,
    sizes: ONE_SIZE,
    colors: ['Black'],
    stock: 'normal',
    shape: 'wallet',
    shortDescription: 'Slim six-slot cardholder in smooth leather.',
    materials: '100% leather',
    careInstructions: 'Wipe with a dry cloth. Do not machine wash.',
  },
  {
    name: 'Calvin Klein Ribbed Knit Jumper',
    slug: 'calvin-klein-ribbed-knit-jumper',
    skuCode: 'CKN-RIB-HD',
    brand: 'calvin-klein',
    category: 'women-sweaters',
    targetGroup: 'WOMEN',
    originalPriceMinor: 11999,
    outletPriceMinor: 5999,
    sizes: ['S', 'M', 'L'],
    colors: ['Beige', 'Black'],
    stock: 'low',
    shape: 'hoodie',
    shortDescription: 'Fine-gauge ribbed jumper with a mock neck.',
    materials: '55% viscose, 45% cotton',
  },

  // --- Levi’s ---------------------------------------------------------------
  {
    name: 'Levi’s 501 Original Jeans',
    slug: 'levis-501-original-jeans',
    skuCode: 'LEV-501-PT',
    brand: 'levis',
    category: 'men-jeans',
    targetGroup: 'MEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 7699,
    sizes: WAIST_SIZES,
    colors: ['Blue'],
    stock: 'normal',
    shape: 'pants',
    shortDescription: 'The original straight-fit button-fly jeans.',
    materials: '100% cotton denim',
  },
  {
    name: 'Levi’s Trucker Denim Jacket',
    slug: 'levis-trucker-denim-jacket',
    skuCode: 'LEV-TRK-JK',
    brand: 'levis',
    category: 'unisex-jackets',
    targetGroup: 'UNISEX',
    originalPriceMinor: 11999,
    outletPriceMinor: 8399,
    sizes: CLOTHING_SIZES,
    colors: ['Blue', 'Black'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'The classic trucker cut in rigid cotton denim.',
    materials: '100% cotton denim',
  },
  {
    name: 'Levi’s Batwing Logo Tee',
    slug: 'levis-batwing-logo-tee',
    skuCode: 'LEV-BAT-TS',
    brand: 'levis',
    category: 'unisex-t-shirts',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2999,
    outletPriceMinor: 1499,
    sizes: CLOTHING_SIZES,
    colors: ['White', 'Red', 'Black'],
    stock: 'high',
    shape: 'tee',
    shortDescription: 'Cotton tee with the classic batwing chest logo.',
    materials: '100% cotton',
  },
  {
    name: 'Levi’s 511 Slim Jeans',
    slug: 'levis-511-slim-jeans',
    skuCode: 'LEV-511-PT',
    brand: 'levis',
    category: 'men-jeans',
    targetGroup: 'MEN',
    originalPriceMinor: 9999,
    outletPriceMinor: 5999,
    sizes: WAIST_SIZES,
    colors: ['Blue', 'Grey'],
    stock: 'low',
    shape: 'pants',
    shortDescription: 'Slim through the thigh with a narrow leg opening.',
    materials: '99% cotton, 1% elastane',
  },

  // --- New Balance ----------------------------------------------------------
  {
    name: 'New Balance 574 Core',
    slug: 'new-balance-574-core',
    skuCode: 'NBA-574-SH',
    brand: 'new-balance',
    category: 'unisex-sneakers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 9999,
    outletPriceMinor: 6999,
    sizes: SHOE_SIZES,
    colors: ['Grey', 'Navy'],
    stock: 'normal',
    shape: 'sneaker',
    shortDescription: 'The everyday classic on an ENCAP-cushioned midsole.',
  },
  {
    name: 'New Balance Fresh Foam 880',
    slug: 'new-balance-fresh-foam-880',
    skuCode: 'NBA-880-SH',
    brand: 'new-balance',
    category: 'unisex-running-shoes',
    targetGroup: 'UNISEX',
    originalPriceMinor: 14999,
    outletPriceMinor: 8999,
    sizes: SHOE_SIZES,
    colors: ['Black', 'Blue'],
    stock: 'low',
    shape: 'runner',
    shortDescription: 'Neutral daily trainer with plush Fresh Foam cushioning.',
  },
  {
    name: 'New Balance Athletics Hoodie',
    slug: 'new-balance-athletics-hoodie',
    skuCode: 'NBA-ATH-HD',
    brand: 'new-balance',
    category: 'unisex-hoodies',
    targetGroup: 'UNISEX',
    originalPriceMinor: 7999,
    outletPriceMinor: 4799,
    sizes: CLOTHING_SIZES,
    colors: ['Grey', 'Black'],
    stock: 'normal',
    shape: 'hoodie',
    shortDescription: 'Relaxed hoodie in heavyweight brushed-back fleece.',
    materials: '80% cotton, 20% polyester',
  },
  {
    name: 'New Balance Sport Essentials Tee',
    slug: 'new-balance-sport-essentials-tee',
    skuCode: 'NBA-SPE-TS',
    brand: 'new-balance',
    category: 'women-t-shirts',
    targetGroup: 'WOMEN',
    originalPriceMinor: 3499,
    outletPriceMinor: 2799,
    sizes: ['S', 'M', 'L'],
    colors: ['White', 'Pink'],
    stock: 'normal',
    shape: 'tee',
    shortDescription: 'Boxy cotton tee with a dropped shoulder.',
    materials: '100% cotton',
  },

  // --- The North Face -------------------------------------------------------
  {
    name: 'The North Face Nuptse 1996 Jacket',
    slug: 'the-north-face-nuptse-1996',
    skuCode: 'TNF-NUP-JK',
    brand: 'the-north-face',
    category: 'unisex-jackets',
    targetGroup: 'UNISEX',
    originalPriceMinor: 32999,
    outletPriceMinor: 24749,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Orange'],
    stock: 'low',
    shape: 'jacket',
    shortDescription: 'The 700-fill down icon, baffled and water-repellent.',
    materials: '700-fill goose down, recycled nylon shell',
    careInstructions: 'Tumble dry low with dryer balls to reloft the down.',
  },
  {
    name: 'The North Face Resolve Rain Jacket',
    slug: 'the-north-face-resolve-rain-jacket',
    skuCode: 'TNF-RSV-JK',
    brand: 'the-north-face',
    category: 'men-jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 12999,
    outletPriceMinor: 7799,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'Green'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'Fully seam-sealed 2-layer rain shell with a stowable hood.',
    careInstructions: 'Machine wash warm with technical wash. Do not use fabric softener.',
  },
  {
    name: 'The North Face Borealis Backpack',
    slug: 'the-north-face-borealis-backpack',
    skuCode: 'TNF-BOR-BG',
    brand: 'the-north-face',
    category: 'unisex-backpacks',
    targetGroup: 'UNISEX',
    originalPriceMinor: 13499,
    outletPriceMinor: 9449,
    sizes: ONE_SIZE,
    colors: ['Black', 'Grey'],
    stock: 'normal',
    shape: 'backpack',
    shortDescription: '28 L commuter pack with a suspended laptop sleeve.',
  },
  {
    name: 'The North Face Simple Dome Tee',
    slug: 'the-north-face-simple-dome-tee',
    skuCode: 'TNF-SDM-TS',
    brand: 'the-north-face',
    category: 'unisex-t-shirts',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2999,
    outletPriceMinor: 2249,
    sizes: CLOTHING_SIZES,
    colors: ['Black', 'White', 'Green'],
    stock: 'high',
    shape: 'tee',
    shortDescription: 'Everyday cotton tee with a chest logo hit.',
    materials: '100% cotton',
  },
  {
    name: 'The North Face Chilkat Winter Boot',
    slug: 'the-north-face-chilkat-boot',
    skuCode: 'TNF-CHK-BT',
    brand: 'the-north-face',
    category: 'men-boots',
    targetGroup: 'MEN',
    originalPriceMinor: 17999,
    outletPriceMinor: 11699,
    sizes: SHOE_SIZES,
    colors: ['Black'],
    stock: 'sold-out',
    shape: 'boot',
    shortDescription: 'Insulated waterproof winter boot rated for deep cold.',
    careInstructions: 'Wipe clean with a damp cloth. Re-proof seasonally.',
  },

  // --- Lacoste --------------------------------------------------------------
  {
    name: 'Lacoste L.12.12 Polo',
    slug: 'lacoste-l1212-polo',
    skuCode: 'LAC-L12-TS',
    brand: 'lacoste',
    category: 'men-polos',
    targetGroup: 'MEN',
    originalPriceMinor: 11499,
    outletPriceMinor: 8049,
    sizes: CLOTHING_SIZES,
    colors: ['White', 'Navy', 'Green'],
    stock: 'normal',
    shape: 'polo',
    shortDescription: 'The original petit piqué polo with a ribbed collar.',
    materials: '100% cotton petit piqué',
  },
  {
    name: 'Lacoste Carnaby Evo Sneaker',
    slug: 'lacoste-carnaby-evo',
    skuCode: 'LAC-CRN-SH',
    brand: 'lacoste',
    category: 'women-sneakers',
    targetGroup: 'WOMEN',
    originalPriceMinor: 10999,
    outletPriceMinor: 6599,
    sizes: ['40', '41', '42'],
    colors: ['White', 'Pink'],
    stock: 'low',
    shape: 'sneaker',
    shortDescription: 'Clean leather court sneaker with a tonal heel tab.',
    materials: 'Leather upper',
  },
  {
    name: 'Lacoste Classic Track Jacket',
    slug: 'lacoste-classic-track-jacket',
    skuCode: 'LAC-TRK-JK',
    brand: 'lacoste',
    category: 'men-jackets',
    targetGroup: 'MEN',
    originalPriceMinor: 15999,
    outletPriceMinor: 11199,
    sizes: ['M', 'L', 'XL'],
    colors: ['Navy', 'Green'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'Full-zip track jacket in diamond-weave taffeta.',
  },

  // --- Champion -------------------------------------------------------------
  {
    name: 'Champion Reverse Weave Hoodie',
    slug: 'champion-reverse-weave-hoodie',
    skuCode: 'CHM-RVW-HD',
    brand: 'champion',
    category: 'unisex-hoodies',
    targetGroup: 'UNISEX',
    originalPriceMinor: 8999,
    outletPriceMinor: 4499,
    sizes: CLOTHING_SIZES,
    colors: ['Grey', 'Navy', 'Black'],
    stock: 'normal',
    shape: 'hoodie',
    shortDescription: 'The heavyweight hoodie built to resist vertical shrinkage.',
    materials: '82% cotton, 18% polyester',
  },
  {
    name: 'Champion Script Logo Sweatpants',
    slug: 'champion-script-logo-sweatpants',
    skuCode: 'CHM-SCR-PT',
    brand: 'champion',
    category: 'unisex-trousers',
    targetGroup: 'UNISEX',
    originalPriceMinor: 5999,
    outletPriceMinor: 3599,
    sizes: CLOTHING_SIZES,
    colors: ['Grey', 'Black'],
    stock: 'high',
    shape: 'pants',
    shortDescription: 'Cuffed fleece sweatpants with an embroidered script logo.',
  },
  {
    name: 'Champion Ribbed Knit Scarf',
    slug: 'champion-ribbed-knit-scarf',
    skuCode: 'CHM-SCF-AC',
    brand: 'champion',
    category: 'unisex-scarves',
    targetGroup: 'UNISEX',
    originalPriceMinor: 2499,
    outletPriceMinor: 1999,
    sizes: ONE_SIZE,
    colors: ['Grey', 'Red'],
    stock: 'low',
    shape: 'scarf',
    shortDescription: 'Chunky ribbed scarf in a soft acrylic blend.',
    materials: '100% acrylic',
  },

  // --- Kids -----------------------------------------------------------------
  // Sized in years and in the 28–34 EU shoe range, so kids' sizes can never be
  // confused with the adult scale in a shared size filter.
  {
    name: 'Adidas Kids Essentials T-Shirt',
    slug: 'adidas-kids-essentials-t-shirt',
    skuCode: 'ADI-KID-TS',
    brand: 'adidas',
    category: 'kids-t-shirts',
    targetGroup: 'KIDS',
    originalPriceMinor: 1999,
    outletPriceMinor: 1199,
    sizes: KIDS_CLOTHING_SIZES,
    colors: ['White', 'Blue'],
    stock: 'high',
    shape: 'tee',
    shortDescription: 'Soft cotton tee cut for everyday play, with a printed logo.',
    materials: '100% cotton',
  },
  {
    name: 'Nike Kids Sportswear Hoodie',
    slug: 'nike-kids-sportswear-hoodie',
    skuCode: 'NIK-KID-HD',
    brand: 'nike',
    category: 'kids-hoodies',
    targetGroup: 'KIDS',
    originalPriceMinor: 4499,
    outletPriceMinor: 2699,
    sizes: KIDS_CLOTHING_SIZES,
    colors: ['Grey', 'Navy'],
    stock: 'normal',
    shape: 'hoodie',
    shortDescription: 'Brushed-back fleece hoodie with a roomy kangaroo pocket.',
    materials: '80% cotton, 20% polyester',
  },
  {
    name: 'Puma Kids Trainer',
    slug: 'puma-kids-trainer',
    skuCode: 'PUM-KID-SH',
    brand: 'puma',
    category: 'kids-sneakers',
    targetGroup: 'KIDS',
    originalPriceMinor: 4999,
    outletPriceMinor: 2999,
    sizes: KIDS_SHOE_SIZES,
    colors: ['White', 'Black'],
    stock: 'normal',
    shape: 'sneaker',
    shortDescription: 'Lightweight trainer with a hook-and-loop strap for quick fastening.',
    materials: 'Synthetic upper, rubber outsole',
  },
  {
    name: 'The North Face Kids Puffer Jacket',
    slug: 'the-north-face-kids-puffer-jacket',
    skuCode: 'TNF-KID-JK',
    brand: 'the-north-face',
    category: 'kids-jackets',
    targetGroup: 'KIDS',
    originalPriceMinor: 9999,
    outletPriceMinor: 5999,
    sizes: KIDS_CLOTHING_SIZES,
    colors: ['Black', 'Red'],
    stock: 'low',
    shape: 'jacket',
    shortDescription: 'Insulated puffer with a fixed hood and elasticated cuffs.',
    materials: 'Recycled polyester shell, synthetic insulation',
    careInstructions: 'Machine wash cold on a gentle cycle. Tumble dry low to reloft.',
  },
  {
    name: 'Levi’s Kids Slim Jeans',
    slug: 'levis-kids-slim-jeans',
    skuCode: 'LEV-KID-PT',
    brand: 'levis',
    category: 'kids-jeans',
    targetGroup: 'KIDS',
    originalPriceMinor: 4499,
    outletPriceMinor: 2699,
    sizes: KIDS_CLOTHING_SIZES,
    colors: ['Blue', 'Black'],
    stock: 'normal',
    shape: 'pants',
    shortDescription: 'Slim-leg stretch denim with an adjustable inner waistband.',
    materials: '98% cotton, 2% elastane',
  },
  {
    name: 'Nike Kids Mini Backpack',
    slug: 'nike-kids-mini-backpack',
    skuCode: 'NIK-KID-BP',
    brand: 'nike',
    category: 'kids-backpacks',
    targetGroup: 'KIDS',
    originalPriceMinor: 2999,
    outletPriceMinor: 1799,
    sizes: ONE_SIZE,
    colors: ['Blue', 'Red'],
    stock: 'high',
    shape: 'backpack',
    shortDescription: 'Compact daypack sized for school books, with padded straps.',
    materials: '100% polyester',
  },

  // --- Womenswear top-up ----------------------------------------------------
  {
    name: 'Puma Women’s Running Shoe',
    slug: 'puma-womens-running-shoe',
    skuCode: 'PUM-WMN-SH',
    brand: 'puma',
    category: 'women-sneakers',
    targetGroup: 'WOMEN',
    originalPriceMinor: 7999,
    outletPriceMinor: 4499,
    sizes: ['36', '37', '38', '39', '40'],
    colors: ['White', 'Pink'],
    stock: 'normal',
    shape: 'runner',
    shortDescription: 'Cushioned road runner on a lightweight foam midsole.',
    materials: 'Engineered mesh upper, rubber outsole',
  },
];

export interface CampaignSpec {
  title: string;
  slug: string;
  shortDescription: string;
  startsInDays: number;
  endsInDays: number;
  productSlugs: string[];
  extraDiscountPercent: number;
  position: number;
}

export const CAMPAIGNS: CampaignSpec[] = [
  {
    title: 'Adidas Outlet Sale',
    slug: 'adidas-outlet-sale',
    shortDescription: 'Up to 45% off Adidas essentials, footwear, and more.',
    startsInDays: -1,
    endsInDays: 5,
    extraDiscountPercent: 10,
    position: 1,
    productSlugs: [
      'adidas-essentials-t-shirt',
      'adidas-runfalcon-trainer',
      'adidas-samba-classic',
      'adidas-tiro-track-pants',
      'adidas-trefoil-hoodie',
      'adidas-adicolor-track-jacket',
      'adidas-linear-duffel-bag',
    ],
  },
  {
    title: 'Summer Shoes Sale',
    slug: 'summer-shoes-sale',
    shortDescription: 'Sneakers and runners for the season at outlet prices.',
    startsInDays: -2,
    endsInDays: 4,
    extraDiscountPercent: 5,
    position: 2,
    productSlugs: [
      'nike-revolution-7-runner',
      'puma-suede-classic',
      'adidas-runfalcon-trainer',
      'new-balance-574-core',
      'puma-rs-x-reinvention',
      'lacoste-carnaby-evo',
    ],
  },
  {
    title: 'Sportswear Weekend',
    slug: 'sportswear-weekend',
    shortDescription: 'Weekend-only deals on training gear and fleece.',
    startsInDays: 0,
    endsInDays: 3,
    extraDiscountPercent: 15,
    position: 3,
    productSlugs: [
      'nike-tech-fleece-hoodie',
      'puma-training-shorts',
      'nike-sportswear-club-tee',
      'adidas-tiro-track-pants',
      'nike-dri-fit-training-shorts',
      'champion-script-logo-sweatpants',
      'new-balance-athletics-hoodie',
    ],
  },
  {
    title: 'Cold Weather Edit',
    slug: 'cold-weather-edit',
    shortDescription: 'Down, fleece and waterproof shells built for winter.',
    startsInDays: -3,
    endsInDays: 9,
    extraDiscountPercent: 12,
    position: 4,
    productSlugs: [
      'the-north-face-nuptse-1996',
      'the-north-face-resolve-rain-jacket',
      'tommy-hilfiger-down-jacket',
      'champion-reverse-weave-hoodie',
      'champion-ribbed-knit-scarf',
      'adidas-terrex-hiking-boot',
    ],
  },
  {
    title: 'Up to 60% Off Nike',
    slug: 'up-to-60-off-nike',
    shortDescription: 'The big Nike drop is coming — up to 60% off.',
    startsInDays: 3,
    endsInDays: 10,
    extraDiscountPercent: 20,
    position: 5,
    productSlugs: [
      'nike-sportswear-club-tee',
      'nike-revolution-7-runner',
      'nike-windrunner-jacket',
      'nike-everyday-crew-socks',
      'nike-air-zoom-pegasus-40',
      'nike-brasilia-backpack',
    ],
  },
  {
    title: 'Designer Accessories Sale',
    slug: 'designer-accessories-sale',
    shortDescription: 'Belts, caps, and bags from premium brands.',
    startsInDays: 5,
    endsInDays: 12,
    extraDiscountPercent: 10,
    position: 6,
    productSlugs: [
      'tommy-hilfiger-leather-belt',
      'calvin-klein-cap',
      'puma-backpack-phase',
      'tommy-hilfiger-crossbody-bag',
      'calvin-klein-leather-cardholder',
      'the-north-face-borealis-backpack',
    ],
  },
];

export const CONTENT_PAGES: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'privacy_policy',
    title: 'Privacy Policy',
    body: 'This is placeholder privacy policy content for the demo environment. Replace it with your real policy before any production launch.\n\nWe store account details (name, email), order history, and addresses to fulfil orders. Demo data never leaves your browser.',
  },
  {
    key: 'terms',
    title: 'Terms and Conditions',
    body: 'Placeholder terms and conditions for the demo environment.\n\n1. Orders are only confirmed after successful payment.\n2. Reserved items are held for a limited time (20 minutes by default).\n3. Returns are accepted within 30 days of delivery.',
  },
  {
    key: 'cookie_policy',
    title: 'Cookie Policy',
    body: 'This shop uses strictly necessary storage only: a browser-local cart that keeps your basket between visits. No tracking or marketing cookies are set in the demo build.',
  },
  {
    key: 'faq',
    title: 'Frequently Asked Questions',
    body: 'Q: How long are items reserved in my cart?\nA: 20 minutes by default. The countdown is shown in the cart.\n\nQ: When do campaigns end?\nA: Each campaign shows its end time on the campaign page.\n\nQ: How do returns work?\nA: Request a return from your order page after delivery; refunds are issued after the returned items are inspected.\n\nQ: Are the reviews real?\nA: No. This is a sandbox environment and every review is generated demo content.',
  },
  {
    key: 'shipping_info',
    title: 'Shipping Information',
    body: 'Standard shipping: 3-5 business days (4.95).\nExpress shipping: 1-2 business days (9.95).\nOrders over 100.00 ship free with standard shipping.\n\nDemo note: no real shipments are created.',
  },
  {
    key: 'returns_info',
    title: 'Returns',
    body: 'You can request a return for delivered items within 30 days. Once your return is approved and received, refunds are issued to the original payment method within 5-10 business days.',
  },
  {
    key: 'contact_info',
    title: 'Contact',
    body: 'Outlet Marketplace (demo deployment)\nEmail: support@outlet.local\n\nThis is a static demo of the storefront running on Cloudflare Pages.',
  },
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

/** Base date used for `createdAt` / `publishedFrom`. */
export const CATALOG_EPOCH = '2026-01-01T00:00:00Z';

// --- Derivation rules -------------------------------------------------------

export function quantityFor(plan: StockPlan, variantIndex: number): number {
  switch (plan) {
    case 'sold-out':
      return 0;
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

export function skuFor(spec: ProductSpec, color: string, size: string): string {
  const colorCode = color
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5);
  const sizeCode = size.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${spec.skuCode}-${colorCode}-${sizeCode}`;
}

export function discountPercentFor(spec: ProductSpec): number {
  return Math.round((1 - spec.outletPriceMinor / spec.originalPriceMinor) * 100);
}

export const DEFAULT_CARE_INSTRUCTIONS = 'Machine wash cold. Do not tumble dry.';
export const DEFAULT_COUNTRY_OF_ORIGIN = 'Vietnam';

/**
 * No percentage in the copy on purpose: an active campaign can push the price
 * below the outlet price, and a hardcoded "save 40%" would then contradict the
 * discount badge rendered from the live price. The badge is the number.
 */
export function descriptionFor(spec: ProductSpec): string {
  return `${spec.shortDescription}\n\nOutlet price — reduced from the original retail price. Limited quantities; sizes sell out quickly.`;
}
