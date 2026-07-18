import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  addCartItemSchema,
  applyCouponSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type ApplyCouponInput,
  type UpdateCartItemInput,
} from '@outlet/validation';
import { CartService, type CartIdentity } from './cart.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { OptionalAuth } from '../../common/decorators';
import { SessionService } from '../../common/session.service';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthedRequest } from '../../common/request-user';

@ApiTags('cart')
@Controller('cart')
@UseGuards(SessionAuthGuard)
@OptionalAuth()
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly sessions: SessionService,
  ) {}

  private identity(req: AuthedRequest): CartIdentity {
    return { userId: req.user?.id ?? null, cartToken: req.cartToken ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'Current cart with authoritative reservation timers' })
  async getCart(@Req() req: AuthedRequest) {
    return this.carts.getCartView(this.identity(req));
  }

  @Post('items')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a variant to the cart (reserves stock atomically)' })
  async addItem(
    @Body(new ZodValidationPipe(addCartItemSchema)) body: AddCartItemInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { createdToken } = await this.carts.addItem(this.identity(req), body);
    if (createdToken) {
      this.sessions.setCartCookie(res, createdToken);
      req.cartToken = createdToken;
    }
    return this.carts.getCartView(this.identity(req));
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Change quantity (0 removes; timers are never reset)' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: UpdateCartItemInput,
    @Req() req: AuthedRequest,
  ) {
    const cart = await this.carts.findActiveCart(this.identity(req));
    if (!cart) throw new NotFoundException('Cart not found.');
    await this.carts.changeItemQuantity(cart.id, itemId, body.quantity);
    return this.carts.getCartView(this.identity(req));
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove an item and release its reservation' })
  async removeItem(@Param('itemId') itemId: string, @Req() req: AuthedRequest) {
    const cart = await this.carts.findActiveCart(this.identity(req));
    if (!cart) throw new NotFoundException('Cart not found.');
    await this.carts.removeItem(cart.id, itemId);
    return this.carts.getCartView(this.identity(req));
  }

  @Post('coupon')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a coupon code' })
  async applyCoupon(
    @Body(new ZodValidationPipe(applyCouponSchema)) body: ApplyCouponInput,
    @Req() req: AuthedRequest,
  ) {
    await this.carts.applyCoupon(this.identity(req), body.code);
    return this.carts.getCartView(this.identity(req));
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove the applied coupon' })
  async removeCoupon(@Req() req: AuthedRequest) {
    await this.carts.removeCoupon(this.identity(req));
    return this.carts.getCartView(this.identity(req));
  }
}
