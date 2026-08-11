import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { flattenTree, type CategoryTreeNode } from '@outlet/catalog';
import type { AdminCategoryDto, CategoryLevel, TargetGroup } from '@outlet/types';
import type {
  CategoryDeleteInput,
  CategoryInput,
  CategoryMoveInput,
  CategoryReorderInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { CategoryTreeService } from '../catalog/category-tree.service';

type Actor = { userId: string; email: string };

/** Department → category → subcategory. Nothing sits below the third level. */
const MAX_DEPTH = 3;

/**
 * Category management for the admin panel.
 *
 * The panel sees the whole tree — hidden rows, empty rows and all — because
 * hiding a category from the person whose job is to manage categories is how
 * they become unreachable. What it does *not* get is a second opinion about
 * counts or visibility: both come from CategoryTreeService, the same source the
 * storefront reads, so the "Active / Hidden / Empty" badge always describes
 * what a customer would actually experience.
 */
@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: CategoryTreeService,
    private readonly audit: AuditService,
  ) {}

  // --- Reads -----------------------------------------------------------------

  async listTree(): Promise<AdminCategoryDto[]> {
    const [nodes, totals] = await Promise.all([this.tree.tree(), this.tree.totalCounts()]);
    const descriptions = new Map(
      (await this.prisma.category.findMany({ select: { id: true, description: true } })).map(
        (row) => [row.id, row.description] as const,
      ),
    );
    const toDto = (node: CategoryTreeNode): AdminCategoryDto => ({
      id: node.id,
      name: node.name,
      slug: node.slug,
      parentId: node.parentId,
      position: node.position,
      pathSegment: node.pathSegment,
      path: node.path,
      href: node.href,
      targetGroup: node.targetGroup,
      level: node.level,
      sizeChartGroup: node.sizeChartGroup,
      description: descriptions.get(node.id) ?? null,
      isActive: node.isActive,
      status: node.status,
      isVisible: node.isVisible,
      directProductCount: node.directProductCount,
      productCount: node.productCount,
      totalProductCount: totals[node.id] ?? 0,
      children: node.children.map(toDto),
    });
    return nodes.map(toDto);
  }

  private async nodeOrThrow(id: string): Promise<CategoryTreeNode> {
    const node = flattenTree(await this.tree.tree()).find((entry) => entry.id === id);
    if (!node) throw new NotFoundException('Category not found');
    return node;
  }

  // --- Writes ----------------------------------------------------------------

  /**
   * Where a new or moved row lands in the tree, and whether it is allowed to.
   *
   * A department has no parent and states its own audience; everything else
   * inherits the department's, because a subcategory belonging to a different
   * audience than the department it hangs under is not a thing a shop can mean.
   */
  private async placement(
    parentId: string | null | undefined,
    requested: { targetGroup?: TargetGroup; level?: CategoryLevel },
  ): Promise<{ parentId: string | null; level: CategoryLevel; targetGroup: TargetGroup }> {
    if (!parentId) {
      return {
        parentId: null,
        level: 'department',
        targetGroup: requested.targetGroup ?? 'UNISEX',
      };
    }
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      include: { parent: true },
    });
    if (!parent) throw new BadRequestException('The parent category does not exist.');
    if (parent.parent?.parentId) {
      throw new BadRequestException(
        `Categories go ${MAX_DEPTH} levels deep: department, category, subcategory.`,
      );
    }
    return {
      parentId: parent.id,
      level: parent.parentId ? 'subcategory' : 'category',
      targetGroup: parent.targetGroup,
    };
  }

  /**
   * Two siblings with the same URL fragment would make `/shop/women/shoes`
   * ambiguous, so the fragment is unique among siblings even though the slug
   * is unique globally.
   */
  private async assertSegmentFree(
    parentId: string | null,
    pathSegment: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: { parentId, pathSegment, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) {
      throw new ConflictException(
        `“${clash.name}” already uses the URL fragment “${pathSegment}” here.`,
      );
    }
  }

  /** Slugs are department-prefixed; the fragment is what is left of one. */
  private segmentFrom(slug: string, targetGroup: TargetGroup): string {
    const prefix = `${targetGroup.toLowerCase()}-`;
    return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
  }

  private async nextPosition(parentId: string | null): Promise<number> {
    const last = await this.prisma.category.findFirst({
      where: { parentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  async create(input: CategoryInput, actor: Actor) {
    const existing = await this.prisma.category.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new ConflictException(`A category with the slug “${input.slug}” already exists.`);
    }
    const placement = await this.placement(input.parentId, input);
    const pathSegment = input.pathSegment ?? this.segmentFrom(input.slug, placement.targetGroup);
    await this.assertSegmentFree(placement.parentId, pathSegment);

    const category = await this.prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        pathSegment,
        parentId: placement.parentId,
        targetGroup: placement.targetGroup,
        sizeChartGroup: input.sizeChartGroup ?? null,
        description: input.description ?? null,
        position: input.position ?? (await this.nextPosition(placement.parentId)),
        isActive: input.isActive ?? true,
      },
    });
    await this.log(actor, 'category.created', category.id, {
      name: category.name,
      slug: category.slug,
      level: placement.level,
    });
    return category;
  }

  async update(id: string, input: CategoryInput, actor: Actor) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    const slugTaken = await this.prisma.category.findFirst({
      where: { slug: input.slug, id: { not: id } },
    });
    if (slugTaken) {
      throw new ConflictException(`A category with the slug “${input.slug}” already exists.`);
    }

    // Re-parenting has its own endpoint and its own cycle checks, so an update
    // keeps the row where it is rather than accepting a parent it cannot vet.
    const pathSegment =
      input.pathSegment ?? this.segmentFrom(input.slug, existing.targetGroup as TargetGroup);
    await this.assertSegmentFree(existing.parentId, pathSegment, id);

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        pathSegment,
        sizeChartGroup: input.sizeChartGroup ?? null,
        description: input.description ?? null,
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await this.log(actor, 'category.updated', id, { name: category.name, slug: category.slug });
    return category;
  }

  /**
   * The administrator's own switch, kept deliberately separate from emptiness.
   * Hiding a department hides everything under it, which is why the tree checks
   * the whole ancestry rather than the row alone.
   */
  async setVisibility(id: string, isActive: boolean, actor: Actor) {
    const category = await this.prisma.category.update({ where: { id }, data: { isActive } });
    await this.log(actor, isActive ? 'category.unhidden' : 'category.hidden', id, {
      name: category.name,
      isActive,
    });
    return category;
  }

  async reorder(input: CategoryReorderInput, actor: Actor) {
    const parentId = input.parentId ?? null;
    const siblings = await this.prisma.category.findMany({
      where: { parentId },
      select: { id: true },
    });
    const known = new Set(siblings.map((s) => s.id));
    const unknown = input.orderedIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException('The order contains categories from a different parent.');
    }
    await this.prisma.$transaction(
      input.orderedIds.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
    await this.log(actor, 'category.reordered', parentId, { count: input.orderedIds.length });
    return this.listTree();
  }

  /**
   * Moving a subcategory between categories.
   *
   * Two things have to hold afterwards or the tree is corrupt: the row must not
   * end up inside its own subtree, and the branch must still be at most three
   * deep. Both are checked before anything is written, and the department is
   * re-derived for the row and everything under it — a subcategory dragged from
   * Men into Women is Womenswear now, and its products' audience follows.
   */
  async move(id: string, input: CategoryMoveInput, actor: Actor) {
    const node = await this.nodeOrThrow(id);
    const parentId = input.parentId ?? null;
    if (parentId === id) throw new BadRequestException('A category cannot be its own parent.');

    const descendants = new Set(flattenTree(node.children).map((child) => child.id));
    if (parentId && descendants.has(parentId)) {
      throw new BadRequestException('A category cannot be moved inside itself.');
    }

    const placement = await this.placement(parentId, {});
    const levelDepth = { department: 1, category: 2, subcategory: 3 } as const;
    const depthAtTarget = levelDepth[placement.level] + maxDepth(node.children);
    if (depthAtTarget > MAX_DEPTH) {
      throw new BadRequestException(
        `That move would make the tree ${depthAtTarget} levels deep; the maximum is ${MAX_DEPTH}.`,
      );
    }

    await this.assertSegmentFree(placement.parentId, node.pathSegment, id);

    const position = input.position ?? (await this.nextPosition(placement.parentId));
    const movedIds = [id, ...descendants];
    await this.prisma.$transaction([
      this.prisma.category.update({
        where: { id },
        data: { parentId: placement.parentId, targetGroup: placement.targetGroup, position },
      }),
      // The department is denormalised onto every level, so it has to follow.
      this.prisma.category.updateMany({
        where: { id: { in: movedIds } },
        data: { targetGroup: placement.targetGroup },
      }),
      // Products inherit the audience of the category they sit in; leaving them
      // behind would put menswear under Women's navigation.
      this.prisma.product.updateMany({
        where: { categoryId: { in: movedIds } },
        data: { targetGroup: placement.targetGroup },
      }),
    ]);

    await this.log(actor, 'category.moved', id, {
      name: node.name,
      parentId: placement.parentId,
      targetGroup: placement.targetGroup,
    });
    return this.listTree();
  }

  /**
   * Deleting a category without orphaning what is inside it.
   *
   * The caller must say where the products go — there is no default, because
   * "whatever happens by default" is how a shop discovers three months later
   * that forty products have no category. Children are promoted to the deleted
   * row's parent unless the caller explicitly asks for the whole branch.
   */
  async remove(id: string, input: CategoryDeleteInput, actor: Actor) {
    const node = await this.nodeOrThrow(id);
    const branch = input.childStrategy === 'cascade' ? flattenTree([node]) : [node];
    const branchIds = branch.map((entry) => entry.id);

    if (input.strategy === 'reassign') {
      const target = input.targetCategoryId!;
      if (branchIds.includes(target)) {
        throw new BadRequestException('Products cannot be moved into a category being deleted.');
      }
      const exists = await this.prisma.category.findUnique({ where: { id: target } });
      if (!exists) throw new BadRequestException('The destination category does not exist.');
      await this.prisma.product.updateMany({
        where: { categoryId: { in: branchIds } },
        data: { categoryId: target, targetGroup: exists.targetGroup },
      });
    } else {
      await this.prisma.product.updateMany({
        where: { categoryId: { in: branchIds } },
        data: { categoryId: null },
      });
    }

    if (input.childStrategy === 'promote') {
      await this.prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: node.parentId },
      });
    }

    // Children first: the self-relation is SetNull, and a half-deleted branch
    // would leave rows dangling at the root of the admin tree.
    await this.prisma.category.deleteMany({ where: { id: { in: branchIds.slice().reverse() } } });

    await this.log(actor, 'category.deleted', id, {
      name: node.name,
      strategy: input.strategy,
      childStrategy: input.childStrategy,
      removed: branchIds.length,
    });
    return {
      message: `Deleted ${branchIds.length} categor${branchIds.length === 1 ? 'y' : 'ies'}.`,
    };
  }

  private log(actor: Actor, action: string, entityId: string | null, after: unknown) {
    return this.audit.log({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'ADMIN',
      action,
      entityType: 'Category',
      entityId,
      after: after as never,
    });
  }
}

/** Depth of the deepest branch below a set of nodes; 0 when there are none. */
function maxDepth(nodes: CategoryTreeNode[]): number {
  return nodes.reduce((deepest, node) => Math.max(deepest, 1 + maxDepth(node.children)), 0);
}
