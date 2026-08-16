/**
 * Filling the catalogue out to the shape of the taxonomy.
 *
 * The taxonomy declares 122 subcategories; the hand-written catalogue in
 * ./spec stocks 34 of them. The other 88 were real, navigable, counted rows
 * that led to an empty grid — "Women → Accessories → Scarves" was a link to
 * nothing. A shop with a category it cannot fill should either not show the
 * category or should stock it, and the taxonomy is the part worth keeping.
 *
 * So the gap is closed from data rather than by hand. Writing ~250 more
 * literal product objects would be the same eleven fields restated until the
 * interesting part — what actually distinguishes a loafer from a Chelsea boot
 * — was buried. Instead each *garment type* is described once, in ARCHETYPES,
 * and the departments that carry it are read off the taxonomy. Adding
 * "Women → Shoes → Mules" to the tree therefore stocks it too, which is the
 * property the previous arrangement lacked.
 *
 * Three rules keep the generated half honest:
 *
 *  - **Deterministic.** Every choice is derived from the product's own slug,
 *    never from Math.random or the clock. Ids downstream are hashes of these
 *    slugs, so a re-run has to produce byte-identical output or the seed would
 *    orphan every order that referenced the old ids.
 *  - **Silhouettes are not invented here.** The shape each garment is drawn as
 *    is the one ./artwork already uses for that category tile, so a product and
 *    the tile that leads to it show the same object.
 *  - **The hand-written catalogue wins.** These only ever top a subcategory up
 *    to a decent grid; nothing here overrides or duplicates a product from
 *    ./spec.
 */

import type { ProductShape, ProductSpec, StockPlan } from './spec';
import { CATEGORY_NODES, type CategoryNodeSpec } from './taxonomy';

/**
 * How many products a subcategory should have before it stops looking like a
 * mistake. Four fills one row of the listing grid at its widest.
 */
const TARGET_PER_SUBCATEGORY = 4;

/** Which size ladder a garment is sold on. */
type Sizing = 'clothing' | 'bottoms' | 'shoes' | 'one-size';

interface Archetype {
  /** The garment noun as it appears in the product name. */
  noun: string;
  /** Matches the silhouette ./artwork draws for this category's tile. */
  shape: ProductShape;
  sizing: Sizing;
  /** Adult recommended retail in minor units; childrenswear is scaled down. */
  rrpMinor: number;
  materials: string;
  /** Colourways to draw from, in the vocabulary ./artwork knows. */
  colors: string[];
  /** Completes "…" — kept to one clause, like the hand-written entries. */
  blurb: string;
  /** Only where the default machine-wash line would be wrong. */
  care?: string;
}

/**
 * One entry per garment type, keyed by the taxonomy's `pathSegment`.
 *
 * Keyed by segment rather than by full category slug because a loafer is a
 * loafer whoever it is for — the same resolution ./artwork uses for tiles. The
 * department supplies the audience, the sizes and the price scaling.
 */
const ARCHETYPES: Record<string, Archetype> = {
  // --- Clothing ------------------------------------------------------------
  /*
   * These six garment types are stocked by the written catalogue too. They are
   * declared anyway because a subcategory that merely holds *fewer* than a
   * grid's worth is topped up from here as well, and without an entry the
   * fallback filled Hoodies with something called a Top — a product that
   * contradicts the aisle it is filed under, and that the search test caught by
   * matching "hoodie" against a category keyword no product name shared.
   */
  't-shirts': {
    noun: 'T-Shirt',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 2995,
    materials: '100% cotton',
    colors: ['White', 'Navy', 'Black'],
    blurb: 'Everyday cotton tee with a ribbed collar.',
  },
  hoodies: {
    noun: 'Hoodie',
    shape: 'hoodie',
    sizing: 'clothing',
    rrpMinor: 6995,
    materials: 'Brushed-back fleece',
    colors: ['Grey', 'Navy', 'Black'],
    blurb: 'Brushed-back fleece hoodie with a kangaroo pocket.',
  },
  jackets: {
    noun: 'Jacket',
    shape: 'jacket',
    sizing: 'clothing',
    rrpMinor: 11995,
    materials: 'Water-repellent ripstop',
    colors: ['Navy', 'Green', 'Black'],
    blurb: 'Lightweight shell jacket with taped seams.',
  },
  polos: {
    noun: 'Polo',
    shape: 'polo',
    sizing: 'clothing',
    rrpMinor: 4495,
    materials: 'Cotton piqué',
    colors: ['White', 'Navy', 'Green'],
    blurb: 'Cotton piqué polo with a three-button placket.',
  },
  backpacks: {
    noun: 'Backpack',
    shape: 'backpack',
    sizing: 'one-size',
    rrpMinor: 8995,
    materials: 'Recycled polyester',
    colors: ['Black', 'Grey', 'Navy'],
    blurb: 'Roll-top backpack with a padded laptop sleeve.',
    care: 'Wipe clean with a damp cloth.',
  },
  'running-shoes': {
    noun: 'Running Shoe',
    shape: 'runner',
    sizing: 'shoes',
    rrpMinor: 10995,
    materials: 'Engineered mesh upper, foam midsole',
    colors: ['Blue', 'Black', 'Red'],
    blurb: 'Neutral road runner on a resilient foam midsole.',
    care: 'Wipe clean. Air dry away from direct heat.',
  },

  shirts: {
    noun: 'Shirt',
    shape: 'polo',
    sizing: 'clothing',
    rrpMinor: 5995,
    materials: 'Cotton poplin',
    colors: ['White', 'Blue', 'Beige'],
    blurb: 'Cotton poplin shirt cut close through the body.',
  },
  tops: {
    noun: 'Top',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 3995,
    materials: 'Viscose jersey',
    colors: ['White', 'Black', 'Pink'],
    blurb: 'Drapey jersey top with a scooped neck.',
  },
  blazers: {
    noun: 'Blazer',
    shape: 'jacket',
    sizing: 'clothing',
    rrpMinor: 12995,
    materials: 'Wool-blend twill',
    colors: ['Navy', 'Black', 'Beige'],
    blurb: 'Single-breasted blazer with a half lining.',
    care: 'Dry clean only.',
  },
  coats: {
    noun: 'Coat',
    shape: 'jacket',
    sizing: 'clothing',
    rrpMinor: 18995,
    materials: 'Wool-blend melton',
    colors: ['Beige', 'Black', 'Grey'],
    blurb: 'Long wool-blend coat with a concealed placket.',
    care: 'Dry clean only.',
  },
  sweaters: {
    noun: 'Sweater',
    shape: 'hoodie',
    sizing: 'clothing',
    rrpMinor: 7995,
    materials: 'Merino wool',
    colors: ['Beige', 'Grey', 'Navy'],
    blurb: 'Fine-gauge merino knit with ribbed trims.',
    care: 'Hand wash cold. Dry flat.',
  },
  loungewear: {
    noun: 'Lounge Set',
    shape: 'hoodie',
    sizing: 'clothing',
    rrpMinor: 6495,
    materials: 'Brushed cotton',
    colors: ['Grey', 'Navy', 'Black'],
    blurb: 'Brushed cotton set with a drawcord waist.',
  },
  jumpsuits: {
    noun: 'Jumpsuit',
    shape: 'pants',
    sizing: 'clothing',
    rrpMinor: 8995,
    materials: 'Viscose twill',
    colors: ['Black', 'Green', 'Beige'],
    blurb: 'Wide-leg jumpsuit with a tie waist.',
  },
  dresses: {
    noun: 'Dress',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 8995,
    materials: 'Crepe',
    colors: ['Black', 'Red', 'Beige'],
    blurb: 'Midi dress cut on the bias for a soft drape.',
  },
  trousers: {
    noun: 'Trousers',
    shape: 'pants',
    sizing: 'bottoms',
    rrpMinor: 6995,
    materials: 'Cotton twill',
    colors: ['Beige', 'Navy', 'Black'],
    blurb: 'Tapered twill trousers with a clean front.',
  },
  jeans: {
    noun: 'Jeans',
    shape: 'pants',
    sizing: 'bottoms',
    rrpMinor: 7995,
    materials: 'Stretch denim',
    colors: ['Blue', 'Black', 'Grey'],
    blurb: 'Mid-rise stretch denim with a straight leg.',
  },
  shorts: {
    noun: 'Shorts',
    shape: 'shorts',
    sizing: 'bottoms',
    rrpMinor: 4495,
    materials: 'Cotton poplin',
    colors: ['Black', 'Green', 'Grey'],
    blurb: 'Mid-length shorts with an elasticated back.',
  },
  skirts: {
    noun: 'Skirt',
    shape: 'shorts',
    sizing: 'bottoms',
    rrpMinor: 5995,
    materials: 'Cotton twill',
    colors: ['Black', 'Beige', 'Navy'],
    blurb: 'A-line skirt that sits at the natural waist.',
  },
  overalls: {
    noun: 'Overalls',
    shape: 'pants',
    sizing: 'bottoms',
    rrpMinor: 5495,
    materials: 'Corduroy',
    colors: ['Blue', 'Beige', 'Green'],
    blurb: 'Corduroy dungarees with adjustable straps.',
  },

  // --- Shoes ---------------------------------------------------------------
  sneakers: {
    noun: 'Sneaker',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 8995,
    materials: 'Leather upper, rubber outsole',
    colors: ['White', 'Navy', 'Black'],
    blurb: 'Low-profile court sneaker on a cupsole.',
    care: 'Wipe clean with a damp cloth.',
  },
  'ankle-boots': {
    noun: 'Ankle Boot',
    shape: 'boot',
    sizing: 'shoes',
    rrpMinor: 13995,
    materials: 'Suede upper, leather lining',
    colors: ['Black', 'Beige', 'Green'],
    blurb: 'Suede ankle boot on a stacked block heel.',
    care: 'Brush clean. Protect with a suede spray.',
  },
  boots: {
    noun: 'Boot',
    shape: 'boot',
    sizing: 'shoes',
    rrpMinor: 14995,
    materials: 'Full-grain leather',
    colors: ['Black', 'Beige', 'Green'],
    blurb: 'Lace-up leather boot with a lugged sole.',
    care: 'Wipe clean. Condition the leather occasionally.',
  },
  ballerinas: {
    noun: 'Ballerina Flat',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 7995,
    materials: 'Nappa leather',
    colors: ['Black', 'Beige', 'Pink'],
    blurb: 'Soft nappa ballerina with a padded footbed.',
    care: 'Wipe clean with a damp cloth.',
  },
  flats: {
    noun: 'Flat',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 6995,
    materials: 'Leather upper',
    colors: ['Beige', 'Black', 'Pink'],
    blurb: 'Pointed leather flat with a low topline.',
    care: 'Wipe clean with a damp cloth.',
  },
  loafers: {
    noun: 'Loafer',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 10995,
    materials: 'Polished leather',
    colors: ['Beige', 'Black', 'Navy'],
    blurb: 'Penny loafer on a slim leather sole.',
    care: 'Wipe clean. Condition the leather occasionally.',
  },
  heels: {
    noun: 'Heel',
    shape: 'boot',
    sizing: 'shoes',
    rrpMinor: 9995,
    materials: 'Leather upper',
    colors: ['Black', 'Red', 'Beige'],
    blurb: 'Slingback heel on a covered 70mm block.',
    care: 'Wipe clean with a damp cloth.',
  },
  espadrilles: {
    noun: 'Espadrille',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 5995,
    materials: 'Canvas upper, jute midsole',
    colors: ['Beige', 'Navy', 'White'],
    blurb: 'Canvas espadrille on a braided jute midsole.',
    care: 'Spot clean only.',
  },
  sandals: {
    noun: 'Sandal',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 5495,
    materials: 'Leather straps, moulded footbed',
    colors: ['Beige', 'Black', 'Orange'],
    blurb: 'Two-strap sandal on a contoured footbed.',
    care: 'Wipe clean with a damp cloth.',
  },
  oxfords: {
    noun: 'Oxford',
    shape: 'boot',
    sizing: 'shoes',
    rrpMinor: 12995,
    materials: 'Calf leather',
    colors: ['Black', 'Beige', 'Navy'],
    blurb: 'Closed-lacing oxford with a welted sole.',
    care: 'Wipe clean. Condition the leather occasionally.',
  },
  'formal-shoes': {
    noun: 'Derby',
    shape: 'boot',
    sizing: 'shoes',
    rrpMinor: 13995,
    materials: 'Calf leather',
    colors: ['Black', 'Beige', 'Navy'],
    blurb: 'Open-lacing derby on a leather sole.',
    care: 'Wipe clean. Condition the leather occasionally.',
  },
  sliders: {
    noun: 'Slider',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 3495,
    materials: 'Moulded EVA',
    colors: ['Black', 'White', 'Grey'],
    blurb: 'Moulded slide with a contoured footbed.',
    care: 'Rinse with water and air dry.',
  },
  slippers: {
    noun: 'Slipper',
    shape: 'sneaker',
    sizing: 'shoes',
    rrpMinor: 3995,
    materials: 'Wool felt, rubber sole',
    colors: ['Grey', 'Beige', 'Navy'],
    blurb: 'Felted wool slipper with a soft rubber sole.',
    care: 'Spot clean only.',
  },

  // --- Underwear and nightwear ---------------------------------------------
  briefs: {
    noun: 'Briefs',
    shape: 'shorts',
    sizing: 'clothing',
    rrpMinor: 2495,
    materials: 'Stretch cotton',
    colors: ['Black', 'White', 'Grey'],
    blurb: 'Stretch cotton briefs in a three-pack.',
  },
  bras: {
    noun: 'Bra',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 3495,
    materials: 'Recycled microfibre',
    colors: ['Black', 'Beige', 'White'],
    blurb: 'Wire-free bra with a soft microfibre cup.',
    care: 'Hand wash cold. Dry flat.',
  },
  bodysuits: {
    noun: 'Bodysuit',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 4495,
    materials: 'Stretch jersey',
    colors: ['Black', 'White', 'Beige'],
    blurb: 'Second-skin jersey bodysuit with a snap gusset.',
  },
  shapewear: {
    noun: 'Shaping Bodysuit',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 4995,
    materials: 'Compression jersey',
    colors: ['Black', 'Beige', 'White'],
    blurb: 'Smoothing bodysuit with bonded edges.',
    care: 'Hand wash cold. Dry flat.',
  },
  socks: {
    noun: 'Socks',
    shape: 'socks',
    sizing: 'one-size',
    rrpMinor: 1995,
    materials: 'Combed cotton',
    colors: ['White', 'Black', 'Grey'],
    blurb: 'Ribbed combed-cotton socks in a five-pack.',
  },
  'socks-tights': {
    noun: 'Tights',
    shape: 'socks',
    sizing: 'one-size',
    rrpMinor: 2295,
    materials: 'Recycled polyamide',
    colors: ['Black', 'Grey', 'Beige'],
    blurb: 'Opaque 60-denier tights with a comfort waist.',
    care: 'Hand wash cold. Dry flat.',
  },
  nightwear: {
    noun: 'Pyjama Set',
    shape: 'tee',
    sizing: 'clothing',
    rrpMinor: 4995,
    materials: 'Cotton flannel',
    colors: ['Navy', 'Grey', 'Pink'],
    blurb: 'Brushed flannel pyjamas with piped edges.',
  },
  swimwear: {
    noun: 'Swim Shorts',
    shape: 'shorts',
    sizing: 'clothing',
    rrpMinor: 3995,
    materials: 'Recycled polyamide',
    colors: ['Navy', 'Black', 'Orange'],
    blurb: 'Quick-drying swim shorts with a mesh lining.',
    care: 'Rinse after use. Dry flat in the shade.',
  },

  // --- Accessories ---------------------------------------------------------
  bags: {
    noun: 'Shoulder Bag',
    shape: 'shoulder-bag',
    sizing: 'one-size',
    rrpMinor: 12995,
    materials: 'Grained leather',
    colors: ['Black', 'Beige', 'Grey'],
    blurb: 'Structured shoulder bag with an adjustable strap.',
    care: 'Wipe clean. Store in the dust bag.',
  },
  'travel-bags': {
    noun: 'Travel Holdall',
    shape: 'backpack',
    sizing: 'one-size',
    rrpMinor: 15995,
    materials: 'Coated canvas, leather trim',
    colors: ['Black', 'Navy', 'Grey'],
    blurb: 'Cabin-sized holdall with a wet compartment.',
    care: 'Wipe clean with a damp cloth.',
  },
  wallets: {
    noun: 'Wallet',
    shape: 'wallet',
    sizing: 'one-size',
    rrpMinor: 5995,
    materials: 'Grained leather',
    colors: ['Black', 'Beige', 'Navy'],
    blurb: 'Bifold wallet with six card slots.',
    care: 'Wipe clean with a damp cloth.',
  },
  belts: {
    noun: 'Belt',
    shape: 'belt',
    sizing: 'one-size',
    rrpMinor: 4995,
    materials: 'Full-grain leather',
    colors: ['Black', 'Beige', 'Orange'],
    blurb: 'Leather belt with a brushed pin buckle.',
    care: 'Wipe clean with a damp cloth.',
  },
  hats: {
    noun: 'Cap',
    shape: 'cap',
    sizing: 'one-size',
    rrpMinor: 2995,
    materials: 'Cotton twill',
    colors: ['Black', 'White', 'Navy'],
    blurb: 'Six-panel cap with an adjustable strap.',
  },
  scarves: {
    noun: 'Scarf',
    shape: 'scarf',
    sizing: 'one-size',
    rrpMinor: 4495,
    materials: 'Lambswool',
    colors: ['Grey', 'Red', 'Navy'],
    blurb: 'Brushed lambswool scarf with a fringed edge.',
    care: 'Hand wash cold. Dry flat.',
  },
  gloves: {
    noun: 'Gloves',
    shape: 'socks',
    sizing: 'one-size',
    rrpMinor: 3495,
    materials: 'Merino wool',
    colors: ['Black', 'Grey', 'Navy'],
    blurb: 'Ribbed merino gloves with touchscreen tips.',
    care: 'Hand wash cold. Dry flat.',
  },
  sunglasses: {
    noun: 'Sunglasses',
    shape: 'cap',
    sizing: 'one-size',
    rrpMinor: 8995,
    materials: 'Acetate frame, CR-39 lenses',
    colors: ['Black', 'Beige', 'Grey'],
    blurb: 'Acetate frame with category-3 tinted lenses.',
    care: 'Clean with the supplied cloth.',
  },
  watches: {
    noun: 'Watch',
    shape: 'wallet',
    sizing: 'one-size',
    rrpMinor: 19995,
    materials: 'Stainless steel, sapphire glass',
    colors: ['Black', 'Beige', 'Grey'],
    blurb: 'Three-hand quartz watch with a sapphire crystal.',
    care: 'Wipe clean. Not suitable for swimming.',
  },
  jewellery: {
    noun: 'Pendant Necklace',
    shape: 'wallet',
    sizing: 'one-size',
    rrpMinor: 6995,
    materials: 'Gold-plated brass',
    colors: ['Beige', 'Grey', 'Black'],
    blurb: 'Gold-plated pendant on a fine cable chain.',
    care: 'Keep dry. Store separately.',
  },
  neckties: {
    noun: 'Tie',
    shape: 'scarf',
    sizing: 'one-size',
    rrpMinor: 4495,
    materials: 'Silk',
    colors: ['Navy', 'Red', 'Grey'],
    blurb: 'Silk tie in a 7cm blade.',
    care: 'Dry clean only.',
  },
  cufflinks: {
    noun: 'Cufflinks',
    shape: 'wallet',
    sizing: 'one-size',
    rrpMinor: 5495,
    materials: 'Rhodium-plated brass',
    colors: ['Grey', 'Black', 'Navy'],
    blurb: 'Rhodium-plated cufflinks with a swivel bar.',
    care: 'Polish with a soft cloth.',
  },
  'hair-accessories': {
    noun: 'Hair Clip Set',
    shape: 'wallet',
    sizing: 'one-size',
    rrpMinor: 1995,
    materials: 'Cellulose acetate',
    colors: ['Beige', 'Black', 'Pink'],
    blurb: 'Acetate claw clips in a set of three.',
    care: 'Wipe clean with a soft cloth.',
  },
};

// --- Size ladders -------------------------------------------------------------

/**
 * Size ladders, by garment type and audience.
 *
 * Women's and men's footwear are genuinely different ranges — a women's heel
 * offered in 40–44 is a men's shoe with the wrong label on it — and the same
 * goes for waist sizing. Childrenswear is sized by age throughout, including
 * bottoms, and its shoe ladder stops below the adult one so a "34" in the size
 * filter cannot mean two different feet.
 */
const SIZES: Record<Sizing, Record<'WOMEN' | 'MEN' | 'KIDS' | 'UNISEX', string[]>> = {
  clothing: {
    WOMEN: ['XS', 'S', 'M', 'L', 'XL'],
    MEN: ['S', 'M', 'L', 'XL'],
    UNISEX: ['S', 'M', 'L', 'XL'],
    KIDS: ['4Y', '6Y', '8Y', '10Y', '12Y'],
  },
  bottoms: {
    WOMEN: ['26', '28', '30', '32'],
    MEN: ['30', '32', '34', '36'],
    UNISEX: ['30', '32', '34', '36'],
    KIDS: ['4Y', '6Y', '8Y', '10Y', '12Y'],
  },
  shoes: {
    WOMEN: ['36', '37', '38', '39', '40', '41'],
    MEN: ['40', '41', '42', '43', '44'],
    UNISEX: ['38', '39', '40', '41', '42', '43'],
    KIDS: ['28', '30', '32', '34'],
  },
  'one-size': {
    WOMEN: ['One Size'],
    MEN: ['One Size'],
    UNISEX: ['One Size'],
    KIDS: ['One Size'],
  },
};

/**
 * Stock by position within its subcategory, rather than by one flat rotation.
 *
 * The rotation alone could land sold-out on the only product in an aisle, and
 * a category whose grid opens on "Sold out" reads as a broken shop rather than
 * a busy one. Position 0 and 1 are therefore always buyable; scarcity is
 * allowed to accumulate down the grid, where the low-stock and sold-out states
 * still get exercised.
 */
const STOCK_BY_POSITION: StockPlan[][] = [
  ['normal', 'high', 'normal', 'high'],
  ['high', 'normal', 'low', 'normal'],
  ['low', 'normal', 'single', 'high'],
  ['single', 'low', 'sold-out', 'normal'],
];

/**
 * Model names, the word between the brand and the garment.
 *
 * Deliberately plain nouns rather than invented syllables: "Alder", "Harbour"
 * and "Meridian" read like the ranges a mid-market brand actually ships, and
 * they are what keeps two departments' coats from arriving as the same
 * product with a different audience.
 */
const MODELS = [
  'Alder',
  'Harbour',
  'Meridian',
  'Compass',
  'Orchard',
  'Kestrel',
  'Marlow',
  'Sable',
  'Juniper',
  'Bramble',
  'Aurora',
  'Cavendish',
  'Ellery',
  'Fenwick',
  'Granby',
  'Halcyon',
  'Ivorine',
  'Jetty',
  'Kinross',
  'Lachlan',
  'Mabry',
  'Norwood',
  'Ondine',
  'Pallas',
  'Quill',
  'Ramsay',
  'Selby',
  'Tamsin',
  'Ulverton',
  'Vesper',
  'Wexford',
  'Yarrow',
  'Zephyr',
  'Ashcombe',
  'Bellamy',
  'Corvine',
  'Dunmore',
  'Everly',
  'Fairlie',
  'Gresham',
];

/** Brand slugs, mirroring BRANDS in ./spec. Kept as slugs — ProductSpec takes a slug. */
const BRAND_SLUGS = [
  'aster',
  'northline',
  'velora',
  'maison-rue',
  'urban-theory',
  'lunaro',
  'everline',
  'monarch',
  'atelier-nine',
  'forma',
];

/** Discounts, as percentages off the recommended retail. Uneven on purpose. */
const DISCOUNTS = [20, 25, 30, 35, 40, 45, 50, 55, 27, 33, 42, 60];

// --- Derivation ---------------------------------------------------------------

/**
 * FNV-1a. Any stable hash would do; the requirement is only that it depends on
 * the slug and never on the clock, so two builds of the same catalogue agree.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const pick = <T>(list: T[], seed: number): T => list[seed % list.length];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "Women's", "Men's", "Kids'" — omitted for unisex, which reads better bare. */
function audienceLabel(node: CategoryNodeSpec): string {
  switch (node.targetGroup) {
    case 'WOMEN':
      return "Women's";
    case 'MEN':
      return "Men's";
    case 'KIDS':
      return "Kids'";
    default:
      return '';
  }
}

/** Three initials for the SKU stem, e.g. "maison-rue" -> "MAI". */
const initials = (value: string, length: number): string =>
  value
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, length);

/**
 * Money is rounded to a .95 ending after the discount, because a price of
 * €61.43 is the other clear tell of generated data.
 */
function charmPrice(minor: number): number {
  const rounded = Math.max(495, Math.round(minor / 100) * 100 - 5);
  return rounded;
}

function buildProduct(
  node: CategoryNodeSpec,
  archetype: Archetype,
  index: number,
  taken: { slugs: Set<string>; skus: Set<string> },
): ProductSpec {
  // The seed is the category plus the position within it, so a product keeps
  // its identity when an unrelated subcategory gains or loses entries.
  const seed = hash(`${node.slug}#${index}`);
  const brand = pick(BRAND_SLUGS, seed);
  const model = pick(MODELS, seed >>> 3);
  const audience = audienceLabel(node);
  const isKids = node.targetGroup === 'KIDS';

  const brandName = brand
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const name = [brandName, model, audience, archetype.noun].filter(Boolean).join(' ');

  // Childrenswear is cheaper for the same garment, and the arithmetic runs on
  // the recommended retail so the discount stays the headline number.
  const rrp = charmPrice(isKids ? archetype.rrpMinor * 0.62 : archetype.rrpMinor);
  const discount = pick(DISCOUNTS, seed >>> 7);
  const outlet = charmPrice(rrp * (1 - discount / 100));

  const sizes = SIZES[archetype.sizing][node.targetGroup];

  // Two colourways from the archetype's palette, offset so neighbouring
  // products in a grid do not all lead with the same one.
  const offset = seed % archetype.colors.length;
  const colors = [
    archetype.colors[offset],
    archetype.colors[(offset + 1) % archetype.colors.length],
  ];

  // Uniqueness is enforced rather than assumed: the tables above can grow, and
  // a duplicate slug would collapse two products into one row at seed time.
  let slug = slugify(name);
  for (let n = 2; taken.slugs.has(slug); n += 1) slug = `${slugify(name)}-${n}`;
  taken.slugs.add(slug);

  let skuCode = `${initials(brand, 3)}-${initials(model, 3)}-${initials(archetype.noun, 2)}`;
  for (let n = 2; taken.skus.has(skuCode); n += 1) {
    skuCode = `${initials(brand, 3)}-${initials(model, 3)}-${initials(archetype.noun, 2)}${n}`;
  }
  taken.skus.add(skuCode);

  return {
    name,
    slug,
    skuCode,
    brand,
    category: node.slug,
    targetGroup: node.targetGroup,
    originalPriceMinor: rrp,
    outletPriceMinor: outlet,
    sizes,
    colors,
    stock: pick(STOCK_BY_POSITION[Math.min(index, STOCK_BY_POSITION.length - 1)], seed >>> 11),
    shape: archetype.shape,
    shortDescription: archetype.blurb,
    materials: archetype.materials,
    ...(archetype.care ? { careInstructions: archetype.care } : {}),
  };
}

/**
 * The archetype for a subcategory.
 *
 * Falls back from the exact segment to a coarse guess by the parent category,
 * so a subcategory added to the taxonomy without an archetype still gets
 * stocked with something plausible for its aisle rather than being skipped
 * back into emptiness.
 */
function archetypeFor(node: CategoryNodeSpec, parentSegment: string): Archetype | null {
  const direct = ARCHETYPES[node.pathSegment];
  if (direct) return direct;
  switch (parentSegment) {
    case 'shoes':
      return ARCHETYPES.sneakers;
    case 'accessories':
      return ARCHETYPES.bags;
    case 'underwear':
      return ARCHETYPES.briefs;
    case 'clothing':
      return ARCHETYPES.tops;
    default:
      return null;
  }
}

/**
 * Products that bring every subcategory up to TARGET_PER_SUBCATEGORY.
 *
 * `existing` is the hand-written catalogue; whatever it already stocks counts,
 * so this only ever adds the shortfall.
 */
export function coverageProducts(existing: ProductSpec[]): ProductSpec[] {
  const counts = new Map<string, number>();
  for (const product of existing) {
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }

  const bySlug = new Map(CATEGORY_NODES.map((node) => [node.slug, node]));
  const taken = {
    slugs: new Set(existing.map((product) => product.slug)),
    skus: new Set(existing.map((product) => product.skuCode)),
  };

  const filled: ProductSpec[] = [];
  for (const node of CATEGORY_NODES) {
    if (node.level !== 'subcategory') continue;

    const parent = node.parentSlug ? bySlug.get(node.parentSlug) : undefined;
    const archetype = archetypeFor(node, parent?.pathSegment ?? '');
    if (!archetype) continue;

    const have = counts.get(node.slug) ?? 0;
    for (let index = have; index < TARGET_PER_SUBCATEGORY; index += 1) {
      filled.push(buildProduct(node, archetype, index, taken));
    }
  }
  return filled;
}
