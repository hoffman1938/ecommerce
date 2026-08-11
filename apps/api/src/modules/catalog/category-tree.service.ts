import { Injectable } from '@nestjs/common';
import {
  buildCategoryTree,
  type CategoryRow,
  type CategoryTreeNode,
  type DirectCounts,
} from '@outlet/catalog';
import { PrismaService } from '../../common/prisma.service';

/**
 * The one place the category tree is assembled from PostgreSQL.
 *
 * Both the storefront's navigation and the admin panel's management screen read
 * through here, so there is exactly one answer to "how many products does this
 * category have" and exactly one definition of which of them count. Two
 * implementations of that question is how a category ends up visible in one
 * place and hidden in the other.
 */
@Injectable()
export class CategoryTreeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Products a customer could buy today: ACTIVE and inside the publication
   * window. Drafts, disabled and archived rows are excluded, and deleted ones
   * are gone by definition.
   *
   * Stock is not part of it on purpose. A sold-out boot is still a boot, and a
   * category that disappeared the instant its last pair sold would take the
   * restock notice down with it.
   */
  private availabilityWhere() {
    const now = new Date();
    return {
      status: 'ACTIVE' as const,
      categoryId: { not: null },
      OR: [{ publishedFrom: null }, { publishedFrom: { lte: now } }],
      AND: [{ OR: [{ publishedUntil: null }, { publishedUntil: { gt: now } }] }],
    };
  }

  private async directCounts(): Promise<DirectCounts> {
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: this.availabilityWhere(),
      _count: { _all: true },
    });
    const counts: DirectCounts = {};
    for (const group of grouped) {
      if (group.categoryId) counts[group.categoryId] = group._count._all;
    }
    return counts;
  }

  /**
   * Products of *any* status attached to a category.
   *
   * Only the admin panel needs this, and only to warn before a delete: "this
   * category has 4 products" has to include the drafts, or an administrator
   * confirms a safe-looking deletion and orphans work in progress.
   */
  async totalCounts(): Promise<DirectCounts> {
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { categoryId: { not: null } },
      _count: { _all: true },
    });
    const counts: DirectCounts = {};
    for (const group of grouped) {
      if (group.categoryId) counts[group.categoryId] = group._count._all;
    }
    return counts;
  }

  async rows(): Promise<CategoryRow[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    const rows: CategoryRow[] = categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      // Rows created before the three-level tree carry no fragment; the slug is
      // what their URLs already were, so it is the honest fallback.
      pathSegment: c.pathSegment || c.slug,
      parentId: c.parentId,
      targetGroup: c.targetGroup,
      level: 'department',
      position: c.position,
      isActive: c.isActive,
      sizeChartGroup: (c.sizeChartGroup as CategoryRow['sizeChartGroup']) ?? null,
    }));

    // Level is a function of depth, so it is computed from the joined-up rows
    // rather than stored — a column would drift the first time a category was
    // re-parented and nobody remembered to update it.
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    for (const row of rows) {
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      row.level = !parent ? 'department' : parent.parentId ? 'subcategory' : 'category';
    }
    return rows;
  }

  /** The full tree with available-product counts rolled up. Nothing pruned. */
  async tree(): Promise<CategoryTreeNode[]> {
    const [rows, counts] = await Promise.all([this.rows(), this.directCounts()]);
    return buildCategoryTree(rows, counts);
  }
}
