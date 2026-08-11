/**
 * Deterministic review generation.
 *
 * Reviews are demo content, but they must be *identical* everywhere: the
 * Postgres seed (packages/database/src/seed) and the static demo catalog
 * (apps/storefront/src/lib/demo) both derive their reviews from this module, so
 * a product shows the same 4.3 average and the same written reviews whether the
 * page is served by the API or by the Cloudflare Pages export.
 *
 * Everything is a pure function of the product slug — no clock, no RNG state —
 * so repeated runs and both consumers agree.
 */

/** FNV-1a. Small, fast, and stable across engines. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 — a compact seeded PRNG returning [0, 1). */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, options: readonly T[]): T {
  return options[Math.floor(random() * options.length) % options.length];
}

/**
 * Deterministic Fisher-Yates. Used for review bodies so a product's written
 * reviews are drawn without replacement — independent picks from a small bank
 * put the same sentence twice on the first page surprisingly often.
 */
function shuffled<T>(random: () => number, options: readonly T[]): T[] {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Broad product families, used to pick review copy that mentions the right things. */
export type ReviewProductKind = 'shoes' | 'top' | 'bottom' | 'outerwear' | 'bag' | 'accessory';

export interface GeneratedReview {
  /** Stable within a product; callers prefix it to build a global id. */
  key: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  /** Age of the review in days, relative to whatever "now" the caller uses. */
  daysAgo: number;
}

export interface ReviewGenerationInput {
  /** Stable product identity — the slug. */
  slug: string;
  kind: ReviewProductKind;
}

const FIRST_NAMES = [
  'Anna',
  'Marco',
  'Lena',
  'Tobias',
  'Sofia',
  'Jonas',
  'Elif',
  'Daniel',
  'Marta',
  'Pieter',
  'Nina',
  'Lukas',
  'Chiara',
  'Ahmed',
  'Julia',
  'Sander',
  'Katrin',
  'Miguel',
  'Hanna',
  'Oskar',
  'Iva',
  'Thomas',
  'Zoé',
  'Nikola',
  'Freja',
  'Andrei',
  'Maren',
  'Paolo',
  'Ines',
  'Kasper',
] as const;

const LAST_INITIALS = 'ABCDEFGHIJKLMNOPRSTVWZ'.split('');

/**
 * Copy banks. Positive/neutral/negative are chosen by the sampled rating.
 *
 * Each entry is a complete review body, including whatever it says about
 * delivery. Composing bodies from a sentence bank plus a separate note bank
 * looks tempting but reintroduces collisions — two reviews landing on the same
 * sentence with the same (or no) note — so the variants are written out.
 */
const POSITIVE_BY_KIND: Record<ReviewProductKind, readonly string[]> = {
  shoes: [
    'Comfortable straight out of the box — no break-in period at all.',
    'Wore these for a full day of walking and my feet were fine.',
    'Cushioning is better than I expected at the outlet price.',
    'Sizing was spot on for me and the shape suits a wider foot.',
    'Look much more expensive than what I paid.',
    'Second pair I have bought. The grip holds up in the wet.',
    'Arrived a day early and they fit perfectly first time.',
    'Light enough that I forget I am wearing them.',
    'The colour is truer to the photos than I expected.',
    'Held up through a wet winter with no splitting at the seams.',
  ],
  top: [
    'Fabric is heavier than the usual outlet tee — feels durable.',
    'Washed it twice, no shrinking and the print is still perfect.',
    'Fit is true to size, a little longer in the body which I like.',
    'Great everyday piece, I ended up ordering a second colour.',
    'Soft without being thin. Good value.',
    'Shoulders sit properly, which is rare for me off the shelf.',
    'Came well packed and three days early.',
    'Holds its shape after a month of regular wear.',
    'The neckline has not stretched at all, which is my usual complaint.',
    'Bought one, went back for two more.',
  ],
  bottom: [
    'Length was right for me at 178 cm and the waist sits well.',
    'Pockets are deep enough for a phone, which is rare.',
    'Stretches enough to move in but keeps its shape all day.',
    'Ordered my usual size and it fit exactly as expected.',
    'Comfortable for both training and everyday wear.',
    'No sagging at the knees after a full day.',
    'Delivery was quick and the fit needed no adjusting.',
    'The fabric is thicker than I expected for the price.',
    'Waistband stays put without a belt.',
    'Washes well — no fading after several cycles.',
  ],
  outerwear: [
    'Kept me dry through a proper downpour.',
    'Warm without being bulky — layers well over a hoodie.',
    'The cut is flattering and the zips feel solid.',
    'Windproof enough for the coast, which is what I bought it for.',
    'Excellent build quality for an outlet price.',
    'Packs down small enough to live in my bag.',
    'Arrived two days after ordering, well packaged.',
    'Hood actually stays up in wind, which sold me on it.',
    'Cuffs and hem seal properly so nothing gets in.',
    'Worn it daily since November with no complaints.',
  ],
  bag: [
    'Fits a 15" laptop plus gym kit with room to spare.',
    'Straps are padded properly, comfortable even loaded up.',
    'Zips and stitching all feel solid after a month of daily use.',
    'Lighter than it looks and holds its shape when empty.',
    'Exactly the size I wanted for commuting.',
    'Survived a week of travel as my only bag.',
    'Turned up the next day and was exactly as described.',
    'The laptop sleeve is properly padded, not an afterthought.',
    'Water beaded off it in the rain without soaking through.',
    'Enough pockets to stay organised without hunting.',
  ],
  accessory: [
    'Quality is noticeably better than the price suggests.',
    'Simple, well made, goes with everything.',
    'Arrived exactly as pictured — no surprises.',
    'Bought as a gift and it was very well received.',
    'Small detail but the finish is really clean.',
    'Has not worn or frayed at all so far.',
    'Came quickly and was packaged nicely enough to gift as-is.',
    'Does exactly what I wanted, nothing to fault.',
    'The stitching is neat and even throughout.',
    'Feels substantial rather than cheap.',
  ],
};

const NEUTRAL_BY_KIND: Record<ReviewProductKind, readonly string[]> = {
  shoes: [
    'Decent shoe, but they run about half a size small — size up.',
    'Comfortable enough, though the sole is thinner than I hoped.',
    'Fine for casual wear, I would not run in them.',
    'Look good, but the insole flattened faster than expected.',
    'No complaints about the shoe; delivery took over a week.',
  ],
  top: [
    'Nice fit but the fabric is thinner than the product photos suggest.',
    'Good tee, though the colour is a shade darker in person.',
    'Does the job. Slightly boxy through the shoulders.',
    'Fine quality, but the sleeves are shorter than standard.',
    'Happy with it overall — it did crease badly in transit.',
  ],
  bottom: [
    'Comfortable, but the leg is wider than I expected.',
    'Good quality, sizing runs slightly large.',
    'Fine overall — the waistband could be a bit firmer.',
    'Decent, though the pockets are shallower than they look.',
    'Fits well but the length needed taking up.',
  ],
  outerwear: [
    'Warm, but not as water resistant as I assumed.',
    'Good jacket, the sleeves run a little long on me.',
    'Solid for the price, though the lining feels basic.',
    'Does the job, but it is heavier than I wanted for travel.',
    'Nice piece — the hood is not adjustable, which is a shame.',
  ],
  bag: [
    'Roomy, but there are fewer internal pockets than I would like.',
    'Good bag — the base could use more structure.',
    'Fine for daily use, not sure it would survive heavy travel.',
    'Well made, though the straps dig in when it is full.',
    'Does what I need; the zips feel lighter than the rest of it.',
  ],
  accessory: [
    'Perfectly fine, just a bit plainer than the photos.',
    'Good quality, slightly smaller than I pictured.',
    'Does what it should, nothing remarkable.',
    'Fine, but the packaging arrived crushed.',
    'Reasonable for the price, not something I would pay full price for.',
  ],
};

const NEGATIVE_BY_KIND: Record<ReviewProductKind, readonly string[]> = {
  shoes: [
    'Sizing was well off for me — had to return them.',
    'Started creasing badly within two weeks.',
    'The sole separated at the toe after a month.',
    'Far too narrow for a normal foot.',
  ],
  top: [
    'Shrank in the first wash despite following the label.',
    'Much thinner than I expected.',
    'The print cracked after three washes.',
    'Arrived with a pull in the fabric near the hem.',
  ],
  bottom: [
    'The fit was nothing like the size chart suggested.',
    'Seam started going after a month.',
    'Colour ran in the first wash and marked a white top.',
    'Waistband stretched out almost immediately.',
  ],
  outerwear: [
    'Zip snagged from the first week.',
    'Not warm enough for what it claims.',
    'Soaked through in light rain despite the description.',
    'The stitching around the pocket came loose quickly.',
  ],
  bag: [
    'A strap seam gave out sooner than it should have.',
    'Smaller inside than the photos imply.',
    'The zip jammed within a fortnight.',
    'Base sagged out of shape almost immediately.',
  ],
  accessory: [
    'Finish scuffed almost immediately.',
    'Not the quality I expected from the brand.',
    'Came apart at the edge after a few weeks.',
    'Sizing information was simply wrong.',
  ],
};

const POSITIVE_TITLES = [
  'Exactly what I wanted',
  'Great value',
  'Would buy again',
  'Really pleased',
  'Better than expected',
  'Solid buy',
] as const;

const NEUTRAL_TITLES = [
  'Good, with caveats',
  'Decent for the price',
  'Mostly happy',
  'Fine',
] as const;

const NEGATIVE_TITLES = ['Not for me', 'Disappointed', 'Returned it'] as const;

/**
 * Per-product rating character. Most products land between 3.9 and 4.7 — the
 * range real outlet catalogues occupy — with a minority clearly better or worse
 * so the catalogue does not read as uniformly excellent.
 */
function targetMeanFor(random: () => number): number {
  const roll = random();
  if (roll < 0.08) return 3.1 + random() * 0.5; // a few genuinely weak products
  if (roll < 0.24) return 3.6 + random() * 0.4;
  if (roll < 0.78) return 4.0 + random() * 0.5;
  return 4.5 + random() * 0.4;
}

/** Sample a 1–5 star rating clustered around `mean`. */
function sampleRating(random: () => number, mean: number): number {
  // Two rolls averaged gives a soft bell around the mean rather than a flat
  // spread, which is what real rating histograms look like.
  const spread = 1.35;
  const noise = (random() + random() - 1) * spread;
  const raw = Math.round(mean + noise);
  return Math.min(5, Math.max(1, raw));
}

/**
 * Reviews for one product. Deterministic: same slug in, same reviews out.
 *
 * Roughly one product in eight has no reviews at all, which keeps "no reviews
 * yet" a state the UI actually has to handle.
 */
export function generateReviews(input: ReviewGenerationInput): GeneratedReview[] {
  const random = makeRandom(hashString(`reviews:${input.slug}`));

  const countRoll = random();
  if (countRoll < 0.12) return [];

  // Long tail: most products have a handful of reviews, a few have hundreds.
  const reviewCount =
    countRoll < 0.45
      ? 2 + Math.floor(random() * 7)
      : countRoll < 0.85
        ? 9 + Math.floor(random() * 40)
        : 50 + Math.floor(random() * 130);

  const mean = targetMeanFor(random);
  // Only a slice of the total is written out; the rest are ratings-only, which
  // is how real catalogues behave (most buyers rate, few write).
  const writtenCount = Math.min(reviewCount, 3 + Math.floor(random() * 9));

  // One shuffled deck of complete bodies per tone, consumed in order, so no two
  // reviews on a product read identically.
  const decks = {
    positive: shuffled(random, POSITIVE_BY_KIND[input.kind]),
    neutral: shuffled(random, NEUTRAL_BY_KIND[input.kind]),
    negative: shuffled(random, NEGATIVE_BY_KIND[input.kind]),
  };
  const drawn = { positive: 0, neutral: 0, negative: 0 };

  const reviews: GeneratedReview[] = [];
  for (let i = 0; i < writtenCount; i += 1) {
    const rating = sampleRating(random, mean);
    const tone = rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative';
    const titles = rating >= 4 ? POSITIVE_TITLES : rating === 3 ? NEUTRAL_TITLES : NEGATIVE_TITLES;

    const deck = decks[tone];
    // A tone whose deck is spent yields a ratings-only entry rather than
    // repeating a body. Reusing copy is more noticeable to a reader than one
    // fewer written review, and duplicate text is the tell that reviews are
    // generated.
    const exhausted = drawn[tone] >= deck.length;
    const body = exhausted ? '' : deck[drawn[tone]];
    drawn[tone] += 1;

    reviews.push({
      key: `${i}`,
      rating,
      title: exhausted ? null : random() < 0.75 ? pick(random, titles) : null,
      body,
      authorName: exhausted ? '' : `${pick(random, FIRST_NAMES)} ${pick(random, LAST_INITIALS)}.`,
      // Most outlet reviews come from real orders; a minority are unverified.
      isVerifiedPurchase: random() < 0.82,
      helpfulCount: exhausted ? 0 : random() < 0.55 ? Math.floor(random() * 24) : 0,
      daysAgo: 2 + Math.floor(random() * 320),
    });
  }

  // Ratings-only remainder, so the average and histogram reflect `reviewCount`
  // rather than only the written ones.
  for (let i = writtenCount; i < reviewCount; i += 1) {
    reviews.push({
      key: `${i}`,
      rating: sampleRating(random, mean),
      title: null,
      body: '',
      authorName: '',
      isVerifiedPurchase: random() < 0.82,
      helpfulCount: 0,
      daysAgo: 2 + Math.floor(random() * 320),
    });
  }

  return reviews.sort((a, b) => a.daysAgo - b.daysAgo);
}

export interface ReviewAggregate {
  ratingSum: number;
  reviewCount: number;
  /** Mean rounded to one decimal, or null when there are no reviews. */
  ratingAverage: number | null;
  /** Counts keyed "1".."5". */
  distribution: Record<string, number>;
  verifiedCount: number;
}

export function aggregateReviews(
  reviews: ReadonlyArray<Pick<GeneratedReview, 'rating' | 'isVerifiedPurchase'>>,
): ReviewAggregate {
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let ratingSum = 0;
  let verifiedCount = 0;

  for (const review of reviews) {
    ratingSum += review.rating;
    distribution[String(review.rating)] += 1;
    if (review.isVerifiedPurchase) verifiedCount += 1;
  }

  return {
    ratingSum,
    reviewCount: reviews.length,
    ratingAverage: reviews.length === 0 ? null : Math.round((ratingSum / reviews.length) * 10) / 10,
    distribution,
    verifiedCount,
  };
}

/** Mean from stored aggregates, rounded the same way as `aggregateReviews`. */
export function ratingAverageFrom(ratingSum: number, reviewCount: number): number | null {
  if (reviewCount <= 0) return null;
  return Math.round((ratingSum / reviewCount) * 10) / 10;
}

/** Maps a category slug onto the copy family used for generated review text. */
export function reviewKindForCategory(categorySlug: string): ReviewProductKind {
  if (/(shoe|sneaker|trainer|boot|heel|flat|sandal|loafer)/.test(categorySlug)) return 'shoes';
  if (/(jacket|coat|outerwear|parka)/.test(categorySlug)) return 'outerwear';
  if (/(bag|backpack|luggage)/.test(categorySlug)) return 'bag';
  if (/(pant|short|trouser|jean|skirt)/.test(categorySlug)) return 'bottom';
  if (/(shirt|tee|polo|hoodie|sweat|top|dress|knit)/.test(categorySlug)) return 'top';
  return 'accessory';
}
