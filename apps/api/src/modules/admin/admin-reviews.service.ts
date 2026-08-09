import { Injectable } from '@nestjs/common';
import { Prisma } from '@outlet/database';
import type { AdminReviewQueryInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';

/**
 * Review moderation.
 *
 * The one rule that governs everything here: `products.ratingSum` and
 * `products.reviewCount` are denormalised aggregates that the storefront sorts
 * and filters on, and they count PUBLISHED rows only. Any write that changes a
 * review's status, rating, or existence must therefore recompute them for the
 * affected product, or the catalogue starts advertising ratings that its own
 * review list contradicts.
 */
@Injectable()
export class AdminReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute the denormalised rating aggregates from the rows themselves.
   *
   * Deliberately a full recount rather than an incremental delta: moderation
   * moves rows between statuses in bulk, and a recount cannot drift the way
   * accumulated +/- adjustments do. It is a single indexed aggregate per
   * product, so the cost is not worth the risk of skew.
   */
  async recomputeProductRating(
    productId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const aggregate = await tx.productReview.aggregate({
      where: { productId, status: 'PUBLISHED' },
      _sum: { rating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        ratingSum: aggregate._sum.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }

  /** Recompute several products in one pass, de-duplicated. */
  async recomputeMany(
    productIds: readonly string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    for (const productId of new Set(productIds)) {
      await this.recomputeProductRating(productId, tx);
    }
  }

  buildWhere(query: AdminReviewQueryInput): Prisma.ProductReviewWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.verified ? { isVerifiedPurchase: query.verified === 'true' } : {}),
      ...(query.reported === 'true' ? { reportCount: { gt: 0 } } : {}),
      ...(query.replied === 'true' ? { NOT: { adminReply: null } } : {}),
      ...(query.replied === 'false' ? { adminReply: null } : {}),
      ...(query.q
        ? {
            OR: [
              { body: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { authorName: { contains: query.q, mode: 'insensitive' as const } },
              { product: { name: { contains: query.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
  }

  buildOrderBy(
    sort: AdminReviewQueryInput['sort'],
  ): Prisma.ProductReviewOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'highest':
        return [{ rating: 'desc' }, { createdAt: 'desc' }];
      case 'lowest':
        return [{ rating: 'asc' }, { createdAt: 'desc' }];
      case 'helpful':
        return [{ helpfulCount: 'desc' }, { createdAt: 'desc' }];
      case 'reported':
        // Most-reported first; the queue exists to be worked top-down.
        return [{ reportCount: 'desc' }, { createdAt: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  /**
   * Counts for the moderation header.
   *
   * Scoped to the caller's current filters *except* status, so the status tabs
   * can show how many rows each one holds without the numbers collapsing to
   * the tab you are already standing on.
   */
  async stats(query: AdminReviewQueryInput) {
    const base = this.buildWhere({ ...query, status: undefined });
    const [byStatus, byRating, reported, unanswered, aggregate] = await Promise.all([
      this.prisma.productReview.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.productReview.groupBy({
        by: ['rating'],
        where: { ...base, status: 'PUBLISHED' },
        _count: { _all: true },
      }),
      this.prisma.productReview.count({ where: { ...base, reportCount: { gt: 0 } } }),
      this.prisma.productReview.count({
        where: { ...base, status: 'PUBLISHED', adminReply: null },
      }),
      this.prisma.productReview.aggregate({
        where: { ...base, status: 'PUBLISHED' },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      PENDING: 0,
      PUBLISHED: 0,
      REJECTED: 0,
      HIDDEN: 0,
    };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const row of byRating) distribution[String(row.rating)] = row._count._all;

    return {
      statusCounts,
      distribution,
      reported,
      unanswered,
      publishedCount: aggregate._count._all,
      ratingAverage: aggregate._avg.rating,
    };
  }
}
