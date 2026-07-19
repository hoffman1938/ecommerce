import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  cancelReservationSchema,
  inventoryAdjustSchema,
  paginationSchema,
  type CancelReservationInput,
  type InventoryAdjustInput,
} from '@outlet/validation';
import { Permissions } from '@outlet/types';
import { AdminInventoryService } from './admin-inventory.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';

const inventoryQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

const movementsQuerySchema = paginationSchema.extend({
  variantId: z.string().optional(),
});

const reservationsQuerySchema = paginationSchema.extend({
  status: z
    .enum(['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING', 'CONVERTED', 'EXPIRED', 'CANCELLED'])
    .optional(),
});

const csvSchema = z.object({ csv: z.string().min(1) });

@ApiTags('admin')
@Controller('admin/inventory')
@UseGuards(SessionAuthGuard)
export class AdminInventoryController {
  constructor(private readonly inventory: AdminInventoryService) {}

  @Get()
  @RequirePermissions(Permissions.InventoryView)
  @ApiOperation({ summary: 'Stock by SKU with reserved/available breakdown' })
  list(@Query(new ZodValidationPipe(inventoryQuerySchema)) query: z.infer<typeof inventoryQuerySchema>) {
    return this.inventory.listInventory(query);
  }

  @Post('adjust')
  @HttpCode(201)
  @RequirePermissions(Permissions.InventoryAdjust)
  @ApiOperation({
    summary: 'Adjust stock (RESTOCK / ADJUSTMENT_INCREASE / ADJUSTMENT_DECREASE / CORRECTION / DAMAGED) with a mandatory reason',
  })
  adjust(
    @Body(new ZodValidationPipe(inventoryAdjustSchema)) body: InventoryAdjustInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventory.adjust(body, { userId: user.id, email: user.email });
  }

  @Get('movements')
  @RequirePermissions(Permissions.InventoryView)
  @ApiOperation({ summary: 'Inventory movement history' })
  movements(
    @Query(new ZodValidationPipe(movementsQuerySchema)) query: z.infer<typeof movementsQuerySchema>,
  ) {
    return this.inventory.listMovements(query);
  }

  @Get('reservations')
  @RequirePermissions(Permissions.ReservationsView)
  @ApiOperation({ summary: 'Reservations with status filter' })
  reservations(
    @Query(new ZodValidationPipe(reservationsQuerySchema))
    query: z.infer<typeof reservationsQuerySchema>,
  ) {
    return this.inventory.listReservations(query);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permissions.ReservationsCancel)
  @ApiOperation({ summary: 'Cancel a reservation with a reason (releases stock)' })
  cancelReservation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelReservationSchema)) body: CancelReservationInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventory.cancelReservation(id, body.reason, {
      userId: user.id,
      email: user.email,
    });
  }

  @Get('export/csv')
  @RequirePermissions(Permissions.InventoryView)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="inventory.csv"')
  @ApiOperation({ summary: 'Export inventory as CSV' })
  exportCsv() {
    return this.inventory.exportInventoryCsv();
  }

  @Post('import/csv')
  @RequirePermissions(Permissions.InventoryAdjust)
  @ApiOperation({ summary: 'Import inventory corrections from CSV (sku,newOnHandQuantity,reason)' })
  importCsv(
    @Body(new ZodValidationPipe(csvSchema)) body: z.infer<typeof csvSchema>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventory.importInventoryCsv(body.csv, { userId: user.id, email: user.email });
  }
}
