import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SessionAuthGuard } from '../../common/auth.guard';
import { OptionalAuth } from '../../common/decorators';

const simulateSchema = z.object({
  // Mirrors the test cards the mock payment page offers. Failure variants
  // differ only in the reason shown to the customer.
  outcome: z.enum([
    'TEST-SUCCESS',
    'TEST-DELAYED',
    'TEST-CANCEL',
    'TEST-FAIL',
    'TEST-DECLINED',
    'TEST-INSUFFICIENT-FUNDS',
    'TEST-EXPIRED-CARD',
    'TEST-INVALID-CARD',
    'TEST-3DS-FAILED',
    'TEST-PROVIDER-UNAVAILABLE',
    'TEST-TIMEOUT',
  ]),
});

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('webhook/mock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mock provider webhook (HMAC-signed, duplicate-safe)' })
  async mockWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-mock-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleWebhookRequest('mock', raw, signature);
  }

  @Post('webhook/stripe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook (signature-verified, duplicate-safe)' })
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody ?? Buffer.from('');
    return this.payments.handleWebhookRequest('stripe', raw, signature);
  }

  @Post('mock/:paymentId/simulate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Local test control used by the mock payment page. TEST-SUCCESS, TEST-DELAYED and TEST-CANCEL resolve the payment; every other value fails it with a distinct reason.',
  })
  simulate(
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(simulateSchema)) body: z.infer<typeof simulateSchema>,
  ) {
    return this.payments.simulateMockOutcome(paymentId, body.outcome);
  }

  @Get(':paymentId/status')
  @UseGuards(SessionAuthGuard)
  @OptionalAuth()
  @ApiOperation({ summary: 'Poll payment status (used by the result page; not authoritative)' })
  async status(@Param('paymentId') paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, orderNumber: true, status: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return {
      paymentId: payment.id,
      status: payment.status,
      failureReason: payment.failureReason,
      order: payment.order,
    };
  }
}
