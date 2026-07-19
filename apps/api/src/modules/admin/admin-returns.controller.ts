import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@outlet/types';
import {
  receiveReturnItemsSchema,
  returnDecisionSchema,
  type ReceiveReturnItemsInput,
  type ReturnDecisionInput,
} from '@outlet/validation';
import { ReturnsService } from '../returns/returns.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';

@ApiTags('admin')
@Controller('admin/returns')
@UseGuards(SessionAuthGuard)
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  private actor(user: RequestUser) {
    return { userId: user.id, email: user.email };
  }

  @Get()
  @RequirePermissions(Permissions.ReturnsView)
  @ApiOperation({ summary: 'Return requests (filter by status)' })
  list(@Query('status') status?: string) {
    return this.returns.listAll(status);
  }

  @Get(':id')
  @RequirePermissions(Permissions.ReturnsView)
  @ApiOperation({ summary: 'Return request detail' })
  get(@Param('id') id: string) {
    return this.returns.getById(id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReturnsManage)
  @ApiOperation({ summary: 'Approve or reject a return request' })
  decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(returnDecisionSchema)) body: ReturnDecisionInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.returns.decide(id, body, this.actor(user));
  }

  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReturnsManage)
  @ApiOperation({
    summary:
      'Record received items and condition; restocks only items explicitly marked RESELLABLE',
  })
  receive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receiveReturnItemsSchema)) body: ReceiveReturnItemsInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.returns.receiveItems(id, body, this.actor(user));
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReturnsManage)
  @ApiOperation({ summary: 'Complete the return and update the order status' })
  complete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.returns.complete(id, this.actor(user));
  }
}
