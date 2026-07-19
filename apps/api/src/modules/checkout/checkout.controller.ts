import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { checkoutSubmitSchema, type CheckoutSubmitInput } from '@outlet/validation';
import { CheckoutService } from './checkout.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { OptionalAuth } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthedRequest } from '../../common/request-user';

@ApiTags('checkout')
@Controller('checkout')
@UseGuards(SessionAuthGuard)
@OptionalAuth()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Validate the cart, mark reservations as checkout-started (no time extension), and return the quote',
  })
  start(@Req() req: AuthedRequest) {
    return this.checkout.startCheckout({
      userId: req.user?.id ?? null,
      cartToken: req.cartToken ?? null,
    });
  }

  @Post('submit')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Create the order and a payment session. All totals are recomputed server-side; a total mismatch returns 409 TOTALS_CHANGED.',
  })
  submit(
    @Body(new ZodValidationPipe(checkoutSubmitSchema)) body: CheckoutSubmitInput,
    @Req() req: AuthedRequest,
  ) {
    return this.checkout.submit(
      { userId: req.user?.id ?? null, cartToken: req.cartToken ?? null },
      body,
    );
  }
}
