import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@outlet/types';
import { couponInputSchema, type CouponInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';

@ApiTags('admin')
@Controller('admin/coupons')
@UseGuards(SessionAuthGuard)
export class AdminCouponsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private couponData(body: CouponInput) {
    return {
      code: body.code,
      type: body.type,
      value: body.value,
      minOrderMinor: body.minOrderMinor ?? null,
      maxDiscountMinor: body.maxDiscountMinor ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      maxRedemptions: body.maxRedemptions ?? null,
      maxRedemptionsPerCustomer: body.maxRedemptionsPerCustomer ?? null,
      firstOrderOnly: body.firstOrderOnly ?? false,
      isActive: body.isActive ?? true,
      brandIds: body.brandIds ?? [],
      categoryIds: body.categoryIds ?? [],
      productIds: body.productIds ?? [],
      campaignIds: body.campaignIds ?? [],
    };
  }

  @Get()
  @RequirePermissions(Permissions.CouponsView)
  @ApiOperation({ summary: 'All coupons with redemption counts' })
  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions(Permissions.CouponsManage)
  @ApiOperation({ summary: 'Create a coupon (fixed/percentage, limits, restrictions)' })
  async create(
    @Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput,
    @CurrentUser() user: RequestUser,
  ) {
    const exists = await this.prisma.coupon.findUnique({ where: { code: body.code } });
    if (exists) throw new ConflictException('A coupon with this code already exists.');
    const coupon = await this.prisma.coupon.create({ data: this.couponData(body) });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'coupon.created',
      entityType: 'Coupon',
      entityId: coupon.id,
      after: { code: coupon.code, type: coupon.type, value: coupon.value },
    });
    return coupon;
  }

  @Put(':id')
  @RequirePermissions(Permissions.CouponsManage)
  @ApiOperation({ summary: 'Update a coupon' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput,
    @CurrentUser() user: RequestUser,
  ) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');
    const codeTaken = await this.prisma.coupon.findFirst({
      where: { code: body.code, id: { not: id } },
    });
    if (codeTaken) throw new ConflictException('A coupon with this code already exists.');
    const coupon = await this.prisma.coupon.update({ where: { id }, data: this.couponData(body) });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'coupon.updated',
      entityType: 'Coupon',
      entityId: id,
      before: { isActive: existing.isActive, value: existing.value },
      after: { isActive: coupon.isActive, value: coupon.value },
    });
    return coupon;
  }
}
