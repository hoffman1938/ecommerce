import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { assertTransition } from '@outlet/domain';
import type { CampaignStatus } from '@outlet/types';
import { Permissions } from '@outlet/types';
import {
  campaignInputSchema,
  campaignProductInputSchema,
  type CampaignInput,
  type CampaignProductInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';

const statusActionSchema = z.object({
  action: z.enum(['activate', 'pause', 'end', 'archive', 'schedule']),
});

/** Admin-triggered transitions on top of the automatic date-based sweep. */
const CAMPAIGN_ADMIN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE', 'ARCHIVED'],
  SCHEDULED: ['ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ENDED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ENDED', 'ARCHIVED'],
  ENDED: ['ARCHIVED', 'ACTIVE'],
  ARCHIVED: [],
};

const CAMPAIGN_INCLUDE = {
  products: {
    orderBy: { position: 'asc' as const },
    include: {
      product: {
        include: { brand: true, images: { orderBy: { position: 'asc' as const }, take: 1 } },
      },
    },
  },
} as const;

@ApiTags('admin')
@Controller('admin/campaigns')
@UseGuards(SessionAuthGuard)
export class AdminCampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.CampaignsView)
  @ApiOperation({ summary: 'All campaigns (all statuses)' })
  list() {
    return this.prisma.campaign.findMany({
      orderBy: [{ position: 'asc' }, { startsAt: 'desc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CampaignsView)
  @ApiOperation({ summary: 'Campaign detail with assigned products (admin preview)' })
  async get(@Param('id') id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: CAMPAIGN_INCLUDE,
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permissions.CampaignsManage)
  @ApiOperation({ summary: 'Create a campaign' })
  async create(
    @Body(new ZodValidationPipe(campaignInputSchema)) body: CampaignInput,
    @CurrentUser() user: RequestUser,
  ) {
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      throw new ConflictException('Campaign end must be after its start.');
    }
    const exists = await this.prisma.campaign.findUnique({ where: { slug: body.slug } });
    if (exists) throw new ConflictException('A campaign with this slug already exists.');
    const campaign = await this.prisma.campaign.create({
      data: {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'campaign.created',
      entityType: 'Campaign',
      entityId: campaign.id,
      after: { title: campaign.title, status: campaign.status },
    });
    return campaign;
  }

  @Put(':id')
  @RequirePermissions(Permissions.CampaignsManage)
  @ApiOperation({ summary: 'Update campaign fields and schedule' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(campaignInputSchema)) body: CampaignInput,
    @CurrentUser() user: RequestUser,
  ) {
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      throw new ConflictException('Campaign end must be after its start.');
    }
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'campaign.updated',
      entityType: 'Campaign',
      entityId: id,
      before: { status: existing.status, startsAt: existing.startsAt, endsAt: existing.endsAt },
      after: { status: campaign.status, startsAt: campaign.startsAt, endsAt: campaign.endsAt },
    });
    return campaign;
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(Permissions.CampaignsPublish)
  @ApiOperation({ summary: 'Activate / pause / end / archive / schedule a campaign' })
  async changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusActionSchema)) body: z.infer<typeof statusActionSchema>,
    @CurrentUser() user: RequestUser,
  ) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const target: CampaignStatus =
      body.action === 'activate'
        ? 'ACTIVE'
        : body.action === 'pause'
          ? 'PAUSED'
          : body.action === 'end'
            ? 'ENDED'
            : body.action === 'archive'
              ? 'ARCHIVED'
              : 'SCHEDULED';
    assertTransition('campaign', CAMPAIGN_ADMIN_TRANSITIONS, campaign.status, target);
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: target, archivedAt: target === 'ARCHIVED' ? new Date() : null },
    });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: `campaign.${body.action}`,
      entityType: 'Campaign',
      entityId: id,
      before: { status: campaign.status },
      after: { status: target },
    });
    return updated;
  }

  @Post(':id/products')
  @HttpCode(201)
  @RequirePermissions(Permissions.CampaignsManage)
  @ApiOperation({ summary: 'Assign a product with campaign price and limits' })
  async assignProduct(
    @Param('id') campaignId: string,
    @Body(new ZodValidationPipe(campaignProductInputSchema)) body: CampaignProductInput,
  ) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.campaignProduct.upsert({
      where: { campaignId_productId: { campaignId, productId: body.productId } },
      create: { campaignId, ...body },
      update: {
        campaignPriceMinor: body.campaignPriceMinor,
        maxQuantityPerOrder: body.maxQuantityPerOrder,
        quantityLimit: body.quantityLimit,
        position: body.position,
      },
    });
  }

  @Delete(':id/products/:productId')
  @RequirePermissions(Permissions.CampaignsManage)
  @ApiOperation({ summary: 'Remove a product from a campaign' })
  async removeProduct(@Param('id') campaignId: string, @Param('productId') productId: string) {
    await this.prisma.campaignProduct.deleteMany({ where: { campaignId, productId } });
    return { message: 'Product removed from campaign.' };
  }
}
