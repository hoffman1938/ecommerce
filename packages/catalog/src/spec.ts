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
  { name: 'Aster', slug: 'aster', isFeatured: true },
  { name: 'Northline', slug: 'northline', isFeatured: true },
  { name: 'Velora', slug: 'velora', isFeatured: true },
  { name: 'Maison Rue', slug: 'maison-rue', isFeatured: true },
  { name: 'Urban Theory', slug: 'urban-theory', isFeatured: true },
  { name: 'Lunaro', slug: 'lunaro', isFeatured: false },
  { name: 'Everline', slug: 'everline', isFeatured: true },
  { name: 'Monarch', slug: 'monarch', isFeatured: true },
  { name: 'Atelier Nine', slug: 'atelier-nine', isFeatured: false },
  { name: 'Forma', slug: 'forma', isFeatured: false },
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
  // --- Aster ---------------------------------------------------------------
  {
    name: 'Aster Essential Cotton T-Shirt',
    slug: 'aster-essential-cotton-t-shirt',
    skuCode: 'AST-ESS-TS',
    brand: 'aster',
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
    name: 'Aster Runfall Trainer',
    slug: 'aster-runfall-trainer',
    skuCode: 'AST-RNF-SH',
    brand: 'aster',
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
    name: 'Aster Sambra Court Sneaker',
    slug: 'aster-sambra-court-sneaker',
    skuCode: 'AST-SMB-SH',
    brand: 'aster',
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
    name: 'Aster Tiron Track Pants',
    slug: 'aster-tiron-track-pants',
    skuCode: 'AST-TIR-PT',
    brand: 'aster',
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
    name: 'Aster Trifold Logo Hoodie',
    slug: 'aster-trifold-logo-hoodie',
    skuCode: 'AST-TRF-HD',
    brand: 'aster',
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
    name: 'Aster Traverse Hiking Boot',
    slug: 'aster-traverse-hiking-boot',
    skuCode: 'AST-TRX-BT',
    brand: 'aster',
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
    name: 'Aster Linear Duffel Bag',
    slug: 'aster-linear-duffel-bag',
    skuCode: 'AST-DFL-BG',
    brand: 'aster',
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
    name: 'Aster Archive Track Jacket',
    slug: 'aster-archive-track-jacket',
    skuCode: 'AST-ADC-JK',
    brand: 'aster',
    category: 'women-jackets',
    targetGroup: 'WOMEN',
    originalPriceMinor: 7499,
    outletPriceMinor: 4499,
    sizes: ['S', 'M', 'L'],
    colors: ['Black', 'Red'],
    stock: 'normal',
    shape: 'jacket',
    shortDescription: 'Retro track top with contrast piping along the sleeves.',
  },

  // --- Northline -----------------------------------------------------------------
  {
    name: 'Northline Club Sportswear Tee',
    slug: 'northline-club-sportswear-tee',
    skuCode: 'NOR-CLB-TS',
    brand: 'northline',
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
    name: 'Northline Revolve 7 Runner',
    slug: 'northline-revolve-7-runner',
    skuCode: 'NOR-REV-SH',
    brand: 'northline',
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
    name: 'Northline Tech Fleece Hoodie',
    slug: 'northline-tech-fleece-hoodie',
    skuCode: 'NOR-TCH-HD',
    brand: 'northline',
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
    name: 'Northline Windrun Jacket',
    slug: 'northline-windrun-jacket',
    skuCode: 'NOR-WND-JK',
    brand: 'northline',
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
    name: 'Northline Everyday Crew Socks 3-Pack',
    slug: 'northline-everyday-crew-socks-3-pack',
    skuCode: 'NOR-SCK-AC',
    brand: 'northline',
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
    name: 'Northline Aeroglide 40 Running Shoe',
    slug: 'northline-aeroglide-40-running-shoe',
    skuCode: 'NOR-PEG-SH',
    brand: 'northline',
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
    name: 'Northline Brava Training Backpack',
    slug: 'northline-brava-training-backpack',
    skuCode: 'NOR-BRS-BG',
    brand: 'northline',
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
    name: 'Northline DryMotion Training Shorts',
    slug: 'northline-drymotion-training-shorts',
    skuCode: 'NOR-DRI-PT',
    brand: 'northline',
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
    name: 'Northline Heritage 86 Cap',
    slug: 'northline-heritage-86-cap',
    skuCode: 'NOR-H86-AC',
    brand: 'northline',
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

  // --- Velora -----------------------------------------------------------------
  {
    name: 'Velora Suede Classic 21',
    slug: 'velora-suede-classic-21',
    skuCode: 'VEL-SDE-SH',
    brand: 'velora',
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
    name: 'Velora Essentials Logo Tee',
    slug: 'velora-essentials-logo-tee',
    skuCode: 'VEL-ESS-TS',
    brand: 'velora',
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
    name: 'Velora Training Shorts',
    slug: 'velora-training-shorts',
    skuCode: 'VEL-TRN-PT',
    brand: 'velora',
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
    name: 'Velora Phase Backpack',
    slug: 'velora-phase-backpack',
    skuCode: 'VEL-BPK-AC',
    brand: 'velora',
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
    name: 'Velora RX-9 Chunky Sneaker',
    slug: 'velora-rx-9-chunky-sneaker',
    skuCode: 'VEL-RSX-SH',
    brand: 'velora',
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
    name: 'Velora Teamline Zip Hoodie',
    slug: 'velora-teamline-zip-hoodie',
    skuCode: 'VEL-TGL-HD',
    brand: 'velora',
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

  // --- Maison Rue -------------------------------------------------------
  {
    name: 'Maison Rue Crest Piqué Polo',
    slug: 'maison-rue-crest-piqu-polo',
    skuCode: 'MAI-FLG-TS',
    brand: 'maison-rue',
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
    name: 'Maison Rue Down Jacket',
    slug: 'maison-rue-down-jacket',
    skuCode: 'MAI-DWN-JK',
    brand: 'maison-rue',
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
    name: 'Maison Rue Heritage Hoodie',
    slug: 'maison-rue-heritage-hoodie',
    skuCode: 'MAI-HRT-HD',
    brand: 'maison-rue',
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
    name: 'Maison Rue Leather Belt',
    slug: 'maison-rue-leather-belt',
    skuCode: 'MAI-BLT-AC',
    brand: 'maison-rue',
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
    name: 'Maison Rue Chino Trousers',
    slug: 'maison-rue-chino-trousers',
    skuCode: 'MAI-CHN-PT',
    brand: 'maison-rue',
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
    name: 'Maison Rue Crossbody Bag',
    slug: 'maison-rue-crossbody-bag',
    skuCode: 'MAI-CRB-BG',
    brand: 'maison-rue',
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

  // --- Urban Theory ---------------------------------------------------------
  {
    name: 'Urban Theory Modern Cotton Tee',
    slug: 'urban-theory-modern-cotton-tee',
    skuCode: 'URB-MDC-TS',
    brand: 'urban-theory',
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
    name: 'Urban Theory Slim Jeans',
    slug: 'urban-theory-slim-jeans',
    skuCode: 'URB-JNS-PT',
    brand: 'urban-theory',
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
    name: 'Urban Theory Bomber Jacket',
    slug: 'urban-theory-bomber-jacket',
    skuCode: 'URB-BMB-JK',
    brand: 'urban-theory',
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
    name: 'Urban Theory Institutional Cap',
    slug: 'urban-theory-institutional-cap',
    skuCode: 'URB-CAP-AC',
    brand: 'urban-theory',
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
    name: 'Urban Theory Leather Cardholder',
    slug: 'urban-theory-leather-cardholder',
    skuCode: 'URB-CRD-AC',
    brand: 'urban-theory',
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
    name: 'Urban Theory Ribbed Knit Jumper',
    slug: 'urban-theory-ribbed-knit-jumper',
    skuCode: 'URB-RIB-HD',
    brand: 'urban-theory',
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

  // --- Lunaro ---------------------------------------------------------------
  {
    name: 'Lunaro Straight Original Jeans',
    slug: 'lunaro-straight-original-jeans',
    skuCode: 'LUN-STR-PT',
    brand: 'lunaro',
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
    name: 'Lunaro Rider Denim Jacket',
    slug: 'lunaro-rider-denim-jacket',
    skuCode: 'LUN-TRK-JK',
    brand: 'lunaro',
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
    name: 'Lunaro Wingmark Logo Tee',
    slug: 'lunaro-wingmark-logo-tee',
    skuCode: 'LUN-BAT-TS',
    brand: 'lunaro',
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
    name: 'Lunaro Slim Tapered Jeans',
    slug: 'lunaro-slim-tapered-jeans',
    skuCode: 'LUN-SLM-PT',
    brand: 'lunaro',
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

  // --- Everline ----------------------------------------------------------
  {
    name: 'Everline Court 58 Sneaker',
    slug: 'everline-court-58-sneaker',
    skuCode: 'EVE-C58-SH',
    brand: 'everline',
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
    name: 'Everline Cloudfoam 880 Runner',
    slug: 'everline-cloudfoam-880-runner',
    skuCode: 'EVE-FF8-SH',
    brand: 'everline',
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
    name: 'Everline Athletics Hoodie',
    slug: 'everline-athletics-hoodie',
    skuCode: 'EVE-ATH-HD',
    brand: 'everline',
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
    name: 'Everline Sport Essentials Tee',
    slug: 'everline-sport-essentials-tee',
    skuCode: 'EVE-SPE-TS',
    brand: 'everline',
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

  // --- Monarch -------------------------------------------------------
  {
    name: 'Monarch Alpine 1996 Puffer Jacket',
    slug: 'monarch-alpine-1996-puffer-jacket',
    skuCode: 'MON-ALP-JK',
    brand: 'monarch',
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
    name: 'Monarch Resolve Rain Jacket',
    slug: 'monarch-resolve-rain-jacket',
    skuCode: 'MON-RSV-JK',
    brand: 'monarch',
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
    name: 'Monarch Boreal Backpack',
    slug: 'monarch-boreal-backpack',
    skuCode: 'MON-BOR-BG',
    brand: 'monarch',
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
    name: 'Monarch Simple Dome Tee',
    slug: 'monarch-simple-dome-tee',
    skuCode: 'MON-SDM-TS',
    brand: 'monarch',
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
    name: 'Monarch Chilcott Winter Boot',
    slug: 'monarch-chilcott-winter-boot',
    skuCode: 'MON-CHK-BT',
    brand: 'monarch',
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

  // --- Atelier Nine --------------------------------------------------------------
  {
    name: 'Atelier Nine Piqué 12 Polo',
    slug: 'atelier-nine-piqu-12-polo',
    skuCode: 'ATN-P12-TS',
    brand: 'atelier-nine',
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
    name: 'Atelier Nine Canby Court Sneaker',
    slug: 'atelier-nine-canby-court-sneaker',
    skuCode: 'ATN-CRN-SH',
    brand: 'atelier-nine',
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
    name: 'Atelier Nine Classic Track Jacket',
    slug: 'atelier-nine-classic-track-jacket',
    skuCode: 'ATN-TRK-JK',
    brand: 'atelier-nine',
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

  // --- Forma -------------------------------------------------------------
  {
    name: 'Forma Reverse Loop Hoodie',
    slug: 'forma-reverse-loop-hoodie',
    skuCode: 'FOR-RVW-HD',
    brand: 'forma',
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
    name: 'Forma Script Logo Sweatpants',
    slug: 'forma-script-logo-sweatpants',
    skuCode: 'FOR-SCR-PT',
    brand: 'forma',
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
    name: 'Forma Ribbed Knit Scarf',
    slug: 'forma-ribbed-knit-scarf',
    skuCode: 'FOR-SCF-AC',
    brand: 'forma',
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
    name: 'Aster Kids Essential T-Shirt',
    slug: 'aster-kids-essential-t-shirt',
    skuCode: 'AST-KID-TS',
    brand: 'aster',
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
    name: 'Northline Kids Sportswear Hoodie',
    slug: 'northline-kids-sportswear-hoodie',
    skuCode: 'NOR-KID-HD',
    brand: 'northline',
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
    name: 'Velora Kids Trainer',
    slug: 'velora-kids-trainer',
    skuCode: 'VEL-KID-SH',
    brand: 'velora',
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
    name: 'Monarch Kids Puffer Jacket',
    slug: 'monarch-kids-puffer-jacket',
    skuCode: 'MON-KID-JK',
    brand: 'monarch',
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
    name: 'Lunaro Kids Slim Jeans',
    slug: 'lunaro-kids-slim-jeans',
    skuCode: 'LUN-KID-PT',
    brand: 'lunaro',
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
    name: 'Northline Kids Mini Backpack',
    slug: 'northline-kids-mini-backpack',
    skuCode: 'NOR-KID-BP',
    brand: 'northline',
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
    name: 'Velora Women’s Running Shoe',
    slug: 'velora-womens-running-shoe',
    skuCode: 'VEL-WMN-SH',
    brand: 'velora',
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
    title: 'Aster Outlet Sale',
    slug: 'aster-outlet-sale',
    shortDescription: 'Up to 45% off Aster essentials, footwear, and more.',
    startsInDays: -1,
    endsInDays: 5,
    extraDiscountPercent: 10,
    position: 1,
    productSlugs: [
      'aster-essential-cotton-t-shirt',
      'aster-runfall-trainer',
      'aster-sambra-court-sneaker',
      'aster-tiron-track-pants',
      'aster-trifold-logo-hoodie',
      'aster-archive-track-jacket',
      'aster-linear-duffel-bag',
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
      'northline-revolve-7-runner',
      'velora-suede-classic-21',
      'aster-runfall-trainer',
      'everline-court-58-sneaker',
      'velora-rx-9-chunky-sneaker',
      'atelier-nine-canby-court-sneaker',
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
      'northline-tech-fleece-hoodie',
      'velora-training-shorts',
      'northline-club-sportswear-tee',
      'aster-tiron-track-pants',
      'northline-drymotion-training-shorts',
      'forma-script-logo-sweatpants',
      'everline-athletics-hoodie',
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
      'monarch-alpine-1996-puffer-jacket',
      'monarch-resolve-rain-jacket',
      'maison-rue-down-jacket',
      'forma-reverse-loop-hoodie',
      'forma-ribbed-knit-scarf',
      'aster-traverse-hiking-boot',
    ],
  },
  {
    title: 'Up to 60% Off Northline',
    slug: 'up-to-60-off-northline',
    shortDescription: 'The big Northline drop is coming — up to 60% off.',
    startsInDays: 3,
    endsInDays: 10,
    extraDiscountPercent: 20,
    position: 5,
    productSlugs: [
      'northline-club-sportswear-tee',
      'northline-revolve-7-runner',
      'northline-windrun-jacket',
      'northline-everyday-crew-socks-3-pack',
      'northline-aeroglide-40-running-shoe',
      'northline-brava-training-backpack',
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
      'maison-rue-leather-belt',
      'urban-theory-institutional-cap',
      'velora-phase-backpack',
      'maison-rue-crossbody-bag',
      'urban-theory-leather-cardholder',
      'monarch-boreal-backpack',
    ],
  },
];

export const CONTENT_PAGES: Array<{ key: string; title: string; body: string }> = [
  {
    key: "about_us",
    title: "About Us",
    body: "Outlet Marketplace sells surplus stock from ten own-label ranges — last season’s colourways, cancelled wholesale orders, and the tail of a production run that a full-price shop no longer has room for.\n\nThe model is deliberately narrow. Stock is released in short campaigns rather than listed indefinitely, quantities are what they are, and when a size is gone it is gone. That is why an item you add to your basket is held for twenty minutes: with one or two units of a size, a basket that reserves nothing is a basket that disappoints somebody at checkout.\n\nEvery brand you see here is our own. We claim no affiliation with any third-party label.",
  },
  {
    key: "shipping_info",
    title: "Shipping",
    body: "Standard delivery — 3–5 working days, €4.95.\nExpress delivery — 1–2 working days, €9.95.\nStandard delivery is free on orders over €100.\n\nOrders placed before 14:00 on a working day are picked the same day. Delivery estimates exclude weekends and are shown again at checkout for the method you choose.\n\nWe ship across the EU and the UK. Duties for UK addresses are paid at checkout, so nothing is collected on the doorstep.\n\nThis is a demonstration environment: no parcel is dispatched and no carrier is contacted. Tracking numbers shown on an order are simulated.",
  },
  {
    key: "returns_info",
    title: "Returns",
    body: "You have 30 days from delivery to request a return, for any reason.\n\nStart the return from the order in your account. Choose the items and tell us why — the reason is what tells us whether a size runs small, so it is worth a sentence.\n\nItems should come back unworn, with tags attached and in their original packaging. Underwear, swimwear and pierced jewellery cannot be returned once the hygiene seal is broken.\n\nOnce your return arrives and is inspected, the refund goes back to the original payment method within 5–10 working days. Return postage is free within the EU.\n\nIn this demonstration environment no goods move and no money is refunded; the return workflow is fully modelled so that it can be reviewed.",
  },
  {
    key: "size_guide",
    title: "Size Guide",
    body: "Every product page carries the chart for its own category and audience — a men’s shirt and a women’s dress are not measured the same way, and one universal table would be wrong for both. Products that are not sized (bags, wallets, accessories) show no chart at all.\n\nCharts are published in EU, UK, US, IT, FR and JP sizing. Measurements are of the body, not the garment.\n\nHow to measure\nChest — around the fullest part, under the arms, tape level and not pulled tight.\nWaist — around the natural waist, roughly where you bend sideways.\nHips — around the fullest part, feet together.\nInside leg — from the crotch seam to the floor, without shoes.\nFoot length — heel to longest toe, standing, measured late in the day.\n\nBetween two sizes? For knitwear and outerwear take the larger; for jeans and tailoring take the smaller, as both give with wear.",
  },
  {
    key: "privacy_policy",
    title: "Privacy Policy",
    body: "What we hold\nYour name and email address, the addresses you enter for delivery, your order history, and anything you write in a review or a support message.\n\nWhy we hold it\nTo take an order, deliver it, handle a return, and answer you when you get in touch. We do not sell personal data and we run no advertising trackers.\n\nCookies\nTwo, both strictly necessary: one identifies your basket, one keeps you signed in. Neither is used for advertising or shared with anyone.\n\nYour rights\nYou can ask for a copy of your data, ask us to correct it, or ask us to delete your account. Write to the address on the contact page.\n\nThis is a demonstration environment. The accounts and orders in it are synthetic and describe no real person.",
  },
  {
    key: "terms",
    title: "Terms and Conditions",
    body: "1. An order is confirmed when payment succeeds, not when it is submitted.\n2. Items in your basket are reserved for 20 minutes. When that lapses the stock returns to the shop and the basket has to be re-checked.\n3. Prices and discounts are those shown at the moment the order is placed. A campaign ending between adding an item and paying for it changes the price, and the change is shown before payment.\n4. A coupon applies only to the items it covers and only while it is valid. One code per order.\n5. Returns are accepted within 30 days of delivery under the terms on the returns page.\n6. Stock figures are live but are not held until an item is in your basket; a listing showing availability is not an offer.\n\nThis is a demonstration environment operated for evaluation. No contract is formed and no payment is taken.",
  },
  {
    key: "cookie_policy",
    title: "Cookie Policy",
    body: "This shop sets two cookies, both strictly necessary, and no others.\n\noutlet_cart — identifies your basket so it survives closing the tab. Set the first time you add something.\noutlet_session — keeps you signed in. Set when you sign in, cleared when you sign out.\n\nBoth are HttpOnly, which means no script on the page can read them, and both expire on their own — the session after seven days, the basket after thirty.\n\nThere are no analytics, advertising or third-party cookies, which is also why you have not been asked to accept any.",
  },
  {
    key: "faq",
    title: "Frequently Asked Questions",
    body: "How long is an item held in my basket?\nTwenty minutes, counted down on the basket page. It is held against real stock, so nobody else can buy it in that window.\n\nWhy did the price change while I was shopping?\nA campaign started or ended. The basket re-prices itself from the catalogue on every view and tells you which line moved.\n\nSomething is out of stock in my size. Will it come back?\nUsually not. Outlet stock is a fixed quantity; when a size sells out that is generally the end of it.\n\nHow do returns work?\nRequest one from your order page within 30 days of delivery. The refund is issued once the items are back and inspected.\n\nAre the reviews real?\nNo. This is a demonstration environment and every review is generated content, as are the accounts and the order history.",
  },
  {
    key: "contact_info",
    title: "Contact",
    body: "Customer service — support@demo.local\nPress and partnerships — press@demo.local\n\nWe answer within one working day. Have your order number to hand (it looks like OUT-100001) and we can find an order straight away.\n\nThis is a demonstration deployment. The addresses above are placeholders on a reserved domain and reach nobody.",
  },
];

/**
 * The demo coupon codes, shared by both seeds so a code a reviewer is told
 * about in the README exists in whichever database is running.
 *
 * `brandSlug` restricts a coupon to one brand; the seed resolves it to an id,
 * because the coupon row stores ids and the catalogue only knows slugs.
 */
export interface CouponSpec {
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  /** Percent for PERCENTAGE, minor units for FIXED. */
  value: number;
  description: string;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  firstOrderOnly?: boolean;
  maxRedemptionsPerCustomer?: number;
  /** Waives standard shipping regardless of the free-shipping threshold. */
  freeShipping?: boolean;
  brandSlug?: string;
  /** Days from seed time until the code stops working. Omit for no expiry. */
  expiresInDays?: number;
  isActive?: boolean;
}

export const COUPONS: CouponSpec[] = [
  {
    code: 'WELCOME10',
    type: 'PERCENTAGE',
    value: 10,
    description: '10% off your first order',
    firstOrderOnly: true,
    maxRedemptionsPerCustomer: 1,
  },
  {
    code: 'SALE15',
    type: 'PERCENTAGE',
    value: 15,
    description: '15% off orders over €50',
    minOrderMinor: 5000,
    maxDiscountMinor: 4000,
  },
  {
    code: 'DEMO20',
    type: 'PERCENTAGE',
    value: 20,
    description: '20% off, up to €30',
    maxDiscountMinor: 3000,
  },
  {
    code: 'SAVE20',
    type: 'FIXED',
    value: 2000,
    description: '€20 off orders over €100',
    minOrderMinor: 10000,
  },
  {
    code: 'FREESHIP',
    type: 'FIXED',
    value: 0,
    description: 'Free standard shipping',
    freeShipping: true,
    minOrderMinor: 2500,
  },
  {
    code: 'ASTER15',
    type: 'PERCENTAGE',
    value: 15,
    description: '15% off Aster',
    maxDiscountMinor: 5000,
    brandSlug: 'aster',
  },
  {
    // Deliberately already over: the checkout has to reject something, and a
    // reviewer testing "what happens with a bad code" should have one to hand.
    code: 'EXPIRED10',
    type: 'PERCENTAGE',
    value: 10,
    description: 'Expired demo code (rejected at checkout)',
    expiresInDays: -1,
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
