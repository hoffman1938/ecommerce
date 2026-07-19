import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@outlet/database';
import { Permissions } from '@outlet/types';
import {
  disableCustomerSchema,
  paginationSchema,
  supportNoteSchema,
  type DisableCustomerInput,
  type SupportNoteInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';
import { SessionService } from '../../common/session.service';

const customersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
});

@ApiTags('admin')
@Controller('admin/customers')
@UseGuards(SessionAuthGuard)
export class AdminCustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.CustomersView)
  @ApiOperation({ summary: 'Search customers (passwords are never exposed)' })
  async list(
    @Query(new ZodValidationPipe(customersQuerySchema)) query: z.infer<typeof customersQuerySchema>,
  ) {
    const where: Prisma.UserWhereInput = {
      roles: { none: {} }, // customers = users without admin roles
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          isEmailVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: users,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Get(':id')
  @RequirePermissions(Permissions.CustomersView)
  @ApiOperation({ summary: 'Customer profile with orders, addresses, returns, refunds, notes' })
  async get(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        disabledReason: true,
        isEmailVerified: true,
        newsletterOptIn: true,
        createdAt: true,
        addresses: true,
        orders: {
          orderBy: { placedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalMinor: true,
            currencyCode: true,
            placedAt: true,
          },
        },
        returnRequests: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, rmaNumber: true, status: true, createdAt: true },
        },
        supportNotes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { email: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Customer not found');
    const refunds = await this.prisma.refund.findMany({
      where: { order: { userId: id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { ...user, refunds };
  }

  @Post(':id/disable')
  @HttpCode(200)
  @RequirePermissions(Permissions.CustomersDisable)
  @ApiOperation({ summary: 'Disable an account (revokes all sessions)' })
  async disable(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disableCustomerSchema)) body: DisableCustomerInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Customer not found');
    await this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED', disabledReason: body.reason },
    });
    await this.sessions.revokeAllSessions(id);
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'customer.disabled',
      entityType: 'User',
      entityId: id,
      reason: body.reason,
    });
    return { message: 'Account disabled.' };
  }

  @Post(':id/enable')
  @HttpCode(200)
  @RequirePermissions(Permissions.CustomersDisable)
  @ApiOperation({ summary: 'Re-enable an account' })
  async enable(@Param('id') id: string, @CurrentUser() admin: RequestUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Customer not found');
    await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', disabledReason: null, failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'customer.enabled',
      entityType: 'User',
      entityId: id,
    });
    return { message: 'Account re-enabled.' };
  }

  @Post(':id/notes')
  @HttpCode(201)
  @RequirePermissions(Permissions.CustomersSupport)
  @ApiOperation({ summary: 'Add a support note to a customer' })
  async addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportNoteSchema)) body: SupportNoteInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Customer not found');
    return this.prisma.customerSupportNote.create({
      data: { userId: id, authorId: admin.id, note: body.note },
    });
  }
}
