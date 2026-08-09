import {
  Body,
  Controller,
  Get,
  Header,
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
import { formatMinor } from '@outlet/domain';
import { Permissions } from '@outlet/types';
import {
  createRefundSchema,
  orderStatusUpdateSchema,
  paginationSchema,
  supportNoteSchema,
  type CreateRefundInput,
  type OrderStatusUpdateInput,
  type SupportNoteInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';

const ordersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum([
      'DRAFT',
      'AWAITING_PAYMENT',
      'PAID',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'PARTIALLY_RETURNED',
      'RETURNED',
    ])
    .optional(),
});

@ApiTags('admin')
@Controller('admin/orders')
@UseGuards(SessionAuthGuard)
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.OrdersView)
  @ApiOperation({ summary: 'Search and filter orders' })
  async list(
    @Query(new ZodValidationPipe(ordersQuerySchema)) query: z.infer<typeof ordersQuerySchema>,
  ) {
    const where: Prisma.OrderWhereInput = {
      status: query.status ?? { not: 'DRAFT' },
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          payments: true,
          shipments: { include: { events: { orderBy: { occurredAt: 'asc' } } } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: orders.map((o) => this.orders.toOrderDto(o)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  @Get(':id')
  @RequirePermissions(Permissions.OrdersView)
  @ApiOperation({ summary: 'Order detail incl. payment history, status history, notes' })
  async get(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: { include: { events: { orderBy: { createdAt: 'asc' } } } },
        shipments: { include: { events: { orderBy: { occurredAt: 'asc' } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        refunds: true,
        returnRequests: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ...this.orders.toOrderDto(order),
      internalNote: order.internalNote,
      customerNote: order.customerNote,
      customer: order.user,
      statusHistory: order.statusHistory,
      refunds: order.refunds,
      returnRequests: order.returnRequests,
      paymentEvents: order.payments.flatMap((p) => p.events),
    };
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersUpdate)
  @ApiOperation({ summary: 'Change fulfillment status; SHIPPED accepts tracking info' })
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderStatusUpdateSchema)) body: OrderStatusUpdateInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.updateStatus(id, body, { userId: user.id, email: user.email });
  }

  @Post(':id/notes')
  @HttpCode(201)
  @RequirePermissions(Permissions.OrdersView)
  @ApiOperation({ summary: 'Add an internal note' })
  async addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportNoteSchema)) body: SupportNoteInput,
    @CurrentUser() user: RequestUser,
  ) {
    await this.orders.addInternalNote(id, body.note, user.id);
    return { message: 'Note added.' };
  }

  @Post(':id/resend-confirmation')
  @HttpCode(200)
  @RequirePermissions(Permissions.OrdersUpdate)
  @ApiOperation({ summary: 'Resend the order confirmation email' })
  async resend(@Param('id') id: string) {
    await this.orders.resendConfirmationEmail(id);
    return { message: 'Confirmation email queued.' };
  }

  @Post('refunds')
  @HttpCode(201)
  @RequirePermissions(Permissions.RefundsCreate)
  @ApiOperation({ summary: 'Create a full or partial refund through the payment provider' })
  createRefund(
    @Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payments.createRefund(body, { userId: user.id, email: user.email });
  }

  @Get(':id/invoice')
  @RequirePermissions(Permissions.OrdersView)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Printable invoice (HTML)' })
  async invoice(@Param('id') id: string) {
    return this.printableDocument(id, 'INVOICE');
  }

  @Get(':id/packing-slip')
  @RequirePermissions(Permissions.OrdersView)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Printable packing slip (HTML)' })
  async packingSlip(@Param('id') id: string) {
    return this.printableDocument(id, 'PACKING SLIP');
  }

  private async printableDocument(orderId: string, title: 'INVOICE' | 'PACKING SLIP') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const address = order.shippingAddress as Record<string, string>;
    const showPrices = title === 'INVOICE';
    const rows = order.items
      .map(
        (item) => `<tr>
          <td>${item.sku}</td><td>${escapeHtml(item.name)}</td><td style="text-align:center">${item.quantity}</td>
          ${showPrices ? `<td style="text-align:right">${formatMinor(item.unitPriceMinor, order.currencyCode)}</td><td style="text-align:right">${formatMinor(item.totalMinor, order.currencyCode)}</td>` : ''}
        </tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${order.orderNumber}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:14px}h1{font-size:20px}@media print{button{display:none}}</style>
</head><body onload="window.print()">
<button onclick="window.print()">Print</button>
<h1>${title} — ${order.orderNumber}</h1>
<p>Date: ${order.placedAt.toISOString().slice(0, 10)}<br/>Customer: ${escapeHtml(address.firstName ?? '')} ${escapeHtml(address.lastName ?? '')}<br/>
${escapeHtml(address.line1 ?? '')}, ${escapeHtml(address.postalCode ?? '')} ${escapeHtml(address.city ?? '')}, ${escapeHtml(address.countryCode ?? '')}</p>
<table><thead><tr><th>SKU</th><th>Item</th><th style="text-align:center">Qty</th>${showPrices ? '<th style="text-align:right">Unit</th><th style="text-align:right">Total</th>' : ''}</tr></thead>
<tbody>${rows}</tbody></table>
${
  showPrices
    ? `<p style="text-align:right;margin-top:16px">Subtotal: ${formatMinor(order.subtotalMinor, order.currencyCode)}<br/>
Discount: -${formatMinor(order.discountMinor, order.currencyCode)}<br/>
Shipping: ${formatMinor(order.shippingMinor, order.currencyCode)}<br/>
Included VAT: ${formatMinor(order.taxMinor, order.currencyCode)}<br/>
<strong>Total: ${formatMinor(order.totalMinor, order.currencyCode)}</strong></p>`
    : ''
}
<p style="color:#777;font-size:12px;margin-top:40px">Outlet Marketplace — local development document.</p>
</body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
