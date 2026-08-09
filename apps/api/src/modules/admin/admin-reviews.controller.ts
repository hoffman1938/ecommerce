import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@outlet/types';
import {
  adminReviewQuerySchema,
  reviewBulkSchema,
  reviewModerationSchema,
  reviewReplySchema,
  reviewUpdateSchema,
  type AdminReviewQueryInput,
  type ReviewBulkInput,
  type ReviewModerationInput,
  type ReviewReplyInput,
  type ReviewUpdateInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';
import { AdminReviewsService } from './admin-reviews.service';

/** Row shape the moderation table renders; keeps the product join shallow. */
const LIST_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  authorName: true,
  isVerifiedPurchase: true,
  status: true,
  helpfulCount: true,
  adminReply: true,
  adminReplyAt: true,
  reportCount: true,
  reportedAt: true,
  moderationNote: true,
  moderatedAt: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, email: true } },
  adminReplyBy: { select: { id: true, email: true } },
  moderatedBy: { select: { id: true, email: true } },
} as const;

/** Bulk action -> resulting status. `delete`/`clearReports` are handled apart. */
const BULK_STATUS = {
  publish: 'PUBLISHED',
  reject: 'REJECTED',
  hide: 'HIDDEN',
  pending: 'PENDING',
} as const;

@ApiTags('admin')
@Controller('admin/reviews')
@UseGuards(SessionAuthGuard)
export class AdminReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviews: AdminReviewsService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.ReviewsView)
  @ApiOperation({ summary: 'Search and filter reviews for moderation' })
  async list(
    @Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQueryInput,
  ) {
    const where = this.reviews.buildWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        select: LIST_SELECT,
        orderBy: this.reviews.buildOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.productReview.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Get('stats')
  @RequirePermissions(Permissions.ReviewsView)
  @ApiOperation({ summary: 'Rating statistics and moderation queue counts' })
  async stats(
    @Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQueryInput,
  ) {
    return this.reviews.stats(query);
  }

  @Get(':id')
  @RequirePermissions(Permissions.ReviewsView)
  @ApiOperation({ summary: 'Single review with full context' })
  async get(@Param('id') id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
      select: LIST_SELECT,
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ReviewsModerate)
  @ApiOperation({ summary: 'Edit review content (typo fixes, redactions)' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewUpdateSchema)) body: ReviewUpdateInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const before = await this.prisma.productReview.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Review not found');

    const after = await this.prisma.productReview.update({
      where: { id },
      data: {
        ...(body.rating !== undefined ? { rating: body.rating } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.authorName !== undefined ? { authorName: body.authorName } : {}),
      },
      select: LIST_SELECT,
    });

    // An edited rating changes the product average whenever the row is live.
    if (body.rating !== undefined && before.status === 'PUBLISHED') {
      await this.reviews.recomputeProductRating(before.productId);
    }

    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'review.updated',
      entityType: 'ProductReview',
      entityId: id,
      before: { rating: before.rating, title: before.title, body: before.body },
      after: { rating: after.rating, title: after.title, body: after.body },
    });
    return after;
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReviewsModerate)
  @ApiOperation({ summary: 'Approve, reject, hide or re-queue a review' })
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewModerationSchema)) body: ReviewModerationInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const before = await this.prisma.productReview.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Review not found');

    const after = await this.prisma.productReview.update({
      where: { id },
      data: {
        status: body.status,
        moderationNote: body.note ?? null,
        moderatedAt: new Date(),
        moderatedByUserId: admin.id,
      },
      select: LIST_SELECT,
    });

    // Crossing into or out of PUBLISHED is exactly when the aggregates move.
    if (before.status !== body.status) {
      await this.reviews.recomputeProductRating(before.productId);
    }

    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'review.status_changed',
      entityType: 'ProductReview',
      entityId: id,
      before: { status: before.status },
      after: { status: body.status },
      reason: body.note ?? null,
    });
    return after;
  }

  @Post(':id/reply')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReviewsReply)
  @ApiOperation({ summary: 'Publish a shop response beneath a review' })
  async reply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewReplySchema)) body: ReviewReplyInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        adminReply: body.body,
        adminReplyAt: new Date(),
        adminReplyByUserId: admin.id,
      },
      select: LIST_SELECT,
    });
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: existing.adminReply ? 'review.reply_edited' : 'review.replied',
      entityType: 'ProductReview',
      entityId: id,
      before: { adminReply: existing.adminReply },
      after: { adminReply: body.body },
    });
    return updated;
  }

  @Delete(':id/reply')
  @RequirePermissions(Permissions.ReviewsReply)
  @ApiOperation({ summary: 'Withdraw the shop response' })
  async removeReply(@Param('id') id: string, @CurrentUser() admin: RequestUser) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: { adminReply: null, adminReplyAt: null, adminReplyByUserId: null },
      select: LIST_SELECT,
    });
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'review.reply_removed',
      entityType: 'ProductReview',
      entityId: id,
      before: { adminReply: existing.adminReply },
    });
    return updated;
  }

  @Post(':id/clear-reports')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReviewsModerate)
  @ApiOperation({ summary: 'Dismiss abuse reports, leaving the review in place' })
  async clearReports(@Param('id') id: string, @CurrentUser() admin: RequestUser) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: { reportCount: 0, reportedAt: null },
      select: LIST_SELECT,
    });
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'review.reports_cleared',
      entityType: 'ProductReview',
      entityId: id,
      before: { reportCount: existing.reportCount },
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions(Permissions.ReviewsDelete)
  @ApiOperation({ summary: 'Delete a review permanently' })
  async remove(@Param('id') id: string, @CurrentUser() admin: RequestUser) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    await this.prisma.productReview.delete({ where: { id } });
    await this.reviews.recomputeProductRating(existing.productId);

    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'review.deleted',
      entityType: 'ProductReview',
      entityId: id,
      // The full row goes into the audit trail: this is the one action with no
      // undo, so the record has to be enough to reconstruct what was removed.
      before: {
        productId: existing.productId,
        rating: existing.rating,
        title: existing.title,
        body: existing.body,
        authorName: existing.authorName,
        status: existing.status,
        createdAt: existing.createdAt,
      },
    });
    return { message: 'Review deleted.' };
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReviewsModerate)
  @ApiOperation({ summary: 'Apply a moderation action to many reviews at once' })
  async bulk(
    @Body(new ZodValidationPipe(reviewBulkSchema)) body: ReviewBulkInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const targets = await this.prisma.productReview.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, productId: true, status: true },
    });
    if (targets.length === 0) throw new NotFoundException('No matching reviews');

    // Deleting through the bulk route still requires the delete permission —
    // moderate alone must not become a backdoor to permanent removal.
    if (body.action === 'delete' && !admin.permissions.has(Permissions.ReviewsDelete)) {
      throw new ForbiddenException('Insufficient permission to delete reviews');
    }

    const ids = targets.map((t) => t.id);
    const productIds = targets.map((t) => t.productId);

    if (body.action === 'delete') {
      await this.prisma.productReview.deleteMany({ where: { id: { in: ids } } });
      await this.reviews.recomputeMany(productIds);
    } else if (body.action === 'clearReports') {
      await this.prisma.productReview.updateMany({
        where: { id: { in: ids } },
        data: { reportCount: 0, reportedAt: null },
      });
    } else {
      await this.prisma.productReview.updateMany({
        where: { id: { in: ids } },
        data: {
          status: BULK_STATUS[body.action],
          moderationNote: body.note ?? null,
          moderatedAt: new Date(),
          moderatedByUserId: admin.id,
        },
      });
      await this.reviews.recomputeMany(productIds);
    }

    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: `review.bulk_${body.action}`,
      entityType: 'ProductReview',
      entityId: null,
      after: { ids, count: ids.length },
      reason: body.note ?? null,
    });
    return { message: `Updated ${ids.length} review(s).`, count: ids.length, ids };
  }
}
