import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Permissions } from '@outlet/types';
import {
  adminAssignRolesSchema,
  contentPageSchema,
  paginationSchema,
  siteSettingsSchema,
  type AdminAssignRolesInput,
  type ContentPageInput,
  type SiteSettingsInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SettingsService } from '../../common/settings.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';
import { AdminDashboardService } from './admin-dashboard.service';

const auditQuerySchema = paginationSchema.extend({
  entityType: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
});

@ApiTags('admin')
@Controller('admin')
@UseGuards(SessionAuthGuard)
export class AdminMiscController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  // --- Dashboard ------------------------------------------------------------

  @Get('dashboard')
  @RequirePermissions(Permissions.DashboardView)
  @ApiOperation({ summary: 'Dashboard KPIs, sales breakdowns, low stock, recent orders' })
  stats() {
    return this.dashboard.stats();
  }

  // --- Settings -------------------------------------------------------------

  @Get('settings')
  @RequirePermissions(Permissions.SettingsUpdate)
  @ApiOperation({ summary: 'Business settings (incl. reservation duration)' })
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermissions(Permissions.SettingsUpdate)
  @ApiOperation({ summary: 'Update business settings' })
  async updateSettings(
    @Body(new ZodValidationPipe(siteSettingsSchema)) body: SiteSettingsInput,
    @CurrentUser() user: RequestUser,
  ) {
    const before = await this.settings.get();
    await this.settings.update(body, user.id);
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'settings.updated',
      entityType: 'SiteSetting',
      before,
      after: body,
    });
    return this.settings.get();
  }

  // --- Content management ---------------------------------------------------

  @Get('content/pages')
  @RequirePermissions(Permissions.ContentManage)
  @ApiOperation({ summary: 'All editable content pages' })
  listPages() {
    return this.prisma.contentPage.findMany({ orderBy: { key: 'asc' } });
  }

  @Put('content/pages')
  @RequirePermissions(Permissions.ContentManage)
  @ApiOperation({ summary: 'Update a content page (terms, privacy, FAQ, ...)' })
  async updatePage(
    @Body(new ZodValidationPipe(contentPageSchema)) body: ContentPageInput,
    @CurrentUser() user: RequestUser,
  ) {
    const page = await this.prisma.contentPage.upsert({
      where: { key: body.key },
      create: body,
      update: { title: body.title, body: body.body },
    });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'ADMIN',
      action: 'content.updated',
      entityType: 'ContentPage',
      entityId: body.key,
    });
    return page;
  }

  // --- Audit logs -----------------------------------------------------------

  @Get('audit-logs')
  @RequirePermissions(Permissions.AuditLogsView)
  @ApiOperation({ summary: 'Audit trail with filters' })
  async auditLogs(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ) {
    const where = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  // --- Admin users & roles --------------------------------------------------

  @Get('users')
  @RequirePermissions(Permissions.AdminUsersManage)
  @ApiOperation({ summary: 'Users holding at least one admin role' })
  async adminUsers() {
    const users = await this.prisma.user.findMany({
      where: { roles: { some: {} } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { email: 'asc' },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) }));
  }

  @Get('roles')
  @RequirePermissions(Permissions.AdminUsersManage)
  @ApiOperation({ summary: 'All roles with their permissions' })
  async roles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((p) => p.permission.key),
    }));
  }

  @Post('users/:id/roles')
  @HttpCode(200)
  @RequirePermissions(Permissions.AdminUsersManage)
  @ApiOperation({ summary: 'Replace a user’s role assignments' })
  async assignRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminAssignRolesSchema)) body: AdminAssignRolesInput,
    @CurrentUser() admin: RequestUser,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const roles = await this.prisma.role.findMany({ where: { name: { in: body.roleNames } } });
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id })),
        skipDuplicates: true,
      }),
    ]);
    await this.audit.log({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorType: 'ADMIN',
      action: 'admin_user.roles_changed',
      entityType: 'User',
      entityId: id,
      before: { roles: user.roles.map((r) => r.role.name) },
      after: { roles: roles.map((r) => r.name) },
    });
    return { message: 'Roles updated.', roles: roles.map((r) => r.name) };
  }
}
