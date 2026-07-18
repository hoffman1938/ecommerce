import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CampaignDto } from '@outlet/types';
import { PrismaService } from '../../common/prisma.service';
import { CatalogService } from '../catalog/catalog.service';

function toCampaignDto(c: {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  coverImageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  status: CampaignDto['status'];
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
  _count?: { products: number };
}): CampaignDto {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    shortDescription: c.shortDescription,
    description: c.description,
    coverImageUrl: c.coverImageUrl,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    status: c.status,
    position: c.position,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    productCount: c._count?.products,
  };
}

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Active and upcoming visible campaigns' })
  async listCampaigns(@Query('status') status?: 'active' | 'upcoming') {
    const now = new Date();
    const where =
      status === 'upcoming'
        ? { status: 'SCHEDULED' as const, isVisible: true, startsAt: { gt: now } }
        : status === 'active'
          ? { status: 'ACTIVE' as const, isVisible: true, startsAt: { lte: now }, endsAt: { gt: now } }
          : {
              isVisible: true,
              OR: [
                { status: 'ACTIVE' as const, startsAt: { lte: now }, endsAt: { gt: now } },
                { status: 'SCHEDULED' as const, startsAt: { gt: now } },
              ],
            };
    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: [{ position: 'asc' }, { startsAt: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return campaigns.map(toCampaignDto);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Campaign detail with its products' })
  async getCampaign(@Param('slug') slug: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug },
      include: {
        _count: { select: { products: true } },
        products: { orderBy: { position: 'asc' }, select: { productId: true } },
      },
    });
    if (!campaign || !campaign.isVisible || ['DRAFT', 'ARCHIVED'].includes(campaign.status)) {
      throw new NotFoundException('Campaign not found');
    }
    const products = await this.catalog.hydrateListItems(campaign.products.map((p) => p.productId));
    return { ...toCampaignDto(campaign), products };
  }
}
