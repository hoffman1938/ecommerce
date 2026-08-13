import {
  aggregateReviews,
  generateReviews,
  ratingAverageFrom,
  reviewKindForCategory,
} from './reviews';

const SLUGS = Array.from({ length: 200 }, (_, i) => `product-${i}`);

describe('generateReviews', () => {
  it('is deterministic for a given slug', () => {
    const a = generateReviews({ slug: 'northline-aeroglide-40', kind: 'shoes' });
    const b = generateReviews({ slug: 'northline-aeroglide-40', kind: 'shoes' });
    expect(a).toEqual(b);
  });

  it('produces different reviews for different slugs', () => {
    const a = generateReviews({ slug: 'northline-aeroglide-40', kind: 'shoes' });
    const b = generateReviews({ slug: 'velora-suede-classic-21', kind: 'shoes' });
    expect(a).not.toEqual(b);
  });

  it('only emits ratings within 1..5', () => {
    for (const slug of SLUGS) {
      for (const review of generateReviews({ slug, kind: 'top' })) {
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(Number.isInteger(review.rating)).toBe(true);
      }
    }
  });

  it('leaves some products unreviewed so the empty state is reachable', () => {
    const unreviewed = SLUGS.filter(
      (slug) => generateReviews({ slug, kind: 'top' }).length === 0,
    ).length;
    expect(unreviewed).toBeGreaterThan(0);
    expect(unreviewed).toBeLessThan(SLUGS.length / 2);
  });

  it('does not make every product a 5.0', () => {
    const averages = SLUGS.map((slug) => {
      const reviews = generateReviews({ slug, kind: 'shoes' });
      return aggregateReviews(reviews).ratingAverage;
    }).filter((value): value is number => value !== null);

    const perfect = averages.filter((value) => value === 5).length;
    expect(perfect / averages.length).toBeLessThan(0.1);
    expect(Math.min(...averages)).toBeLessThan(4);
    expect(Math.max(...averages)).toBeGreaterThan(4.4);
  });

  it('mixes verified and unverified purchases', () => {
    const reviews = SLUGS.flatMap((slug) => generateReviews({ slug, kind: 'bag' }));
    const verified = reviews.filter((r) => r.isVerifiedPurchase).length;
    expect(verified).toBeGreaterThan(0);
    expect(verified).toBeLessThan(reviews.length);
  });

  it('does not repeat a review body within one product', () => {
    for (const slug of SLUGS) {
      const bodies = generateReviews({ slug, kind: 'shoes' })
        .map((r) => r.body)
        .filter((body) => body !== '');
      // Bodies pair a sentence with an optional delivery note, so a bank of N
      // sentences can produce more than N distinct bodies; what must not happen
      // is the identical string twice.
      expect(new Set(bodies).size).toBe(bodies.length);
    }
  });

  it('gives written reviews a non-empty body and an author', () => {
    for (const slug of SLUGS.slice(0, 40)) {
      for (const review of generateReviews({ slug, kind: 'outerwear' })) {
        if (review.body !== '') expect(review.authorName).not.toBe('');
      }
    }
  });
});

describe('aggregateReviews', () => {
  it('returns a null average with no reviews', () => {
    const result = aggregateReviews([]);
    expect(result.ratingAverage).toBeNull();
    expect(result.reviewCount).toBe(0);
  });

  it('averages to one decimal place and counts the histogram', () => {
    const result = aggregateReviews([
      { rating: 5, isVerifiedPurchase: true },
      { rating: 4, isVerifiedPurchase: false },
      { rating: 4, isVerifiedPurchase: true },
    ]);
    expect(result.ratingAverage).toBe(4.3);
    expect(result.ratingSum).toBe(13);
    expect(result.distribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 });
    expect(result.verifiedCount).toBe(2);
  });
});

describe('ratingAverageFrom', () => {
  it('matches aggregateReviews for the same data', () => {
    const reviews = generateReviews({ slug: 'aster-sambra-court-sneaker', kind: 'shoes' });
    const aggregate = aggregateReviews(reviews);
    expect(ratingAverageFrom(aggregate.ratingSum, aggregate.reviewCount)).toBe(
      aggregate.ratingAverage,
    );
  });

  it('is null when there are no reviews', () => {
    expect(ratingAverageFrom(0, 0)).toBeNull();
  });
});

describe('reviewKindForCategory', () => {
  it.each([
    ['running-shoes', 'shoes'],
    ['sneakers', 'shoes'],
    ['jackets', 'outerwear'],
    ['bags', 'bag'],
    ['pants', 'bottom'],
    ['t-shirts', 'top'],
    ['hoodies', 'top'],
    ['accessories', 'accessory'],
  ])('maps %s to %s', (slug, expected) => {
    expect(reviewKindForCategory(slug)).toBe(expected);
  });
});
