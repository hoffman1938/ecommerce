import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Cart } from '@outlet/database';
import {
  computeCartTotals,
  deliveryEstimate,
  effectiveUnitPriceMinor,
  freeShippingProgress,
  isCampaignRunning,
  secondsRemaining,
  validateCoupon,
} from '@outlet/domain';
import type { CartDto, CartItemDto } from '@outlet/types';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../../common/settings.service';
import { ReservationsService } from '../reservations/reservations.service';

export interface CartIdentity {
  userId?: string | null;
  cartToken?: string | null;
}

const CART_INCLUDE = {
  coupon: true,
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              brand: true,
              category: true,
              images: { orderBy: { position: 'asc' as const } },
            },
          },
          inventory: true,
        },
      },
      campaign: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reservations: ReservationsService,
  ) {}

  // --- Cart identity -------------------------------------------------------

  async findActiveCart(identity: CartIdentity) {
    if (identity.userId) {
      return this.prisma.cart.findFirst({
        where: { userId: identity.userId, status: 'ACTIVE' },
        include: CART_INCLUDE,
      });
    }
    if (identity.cartToken) {
      return this.prisma.cart.findFirst({
        where: { anonymousToken: identity.cartToken, status: 'ACTIVE' },
        include: CART_INCLUDE,
      });
    }
    return null;
  }

  /** Returns the cart and, when a new anonymous cart was made, its token. */
  async getOrCreateCart(identity: CartIdentity): Promise<{ cart: Cart; createdToken?: string }> {
    const existing = await this.findActiveCart(identity);
    if (existing) return { cart: existing };

    if (identity.userId) {
      const cart = await this.prisma.cart.create({ data: { userId: identity.userId } });
      return { cart };
    }
    const token = identity.cartToken ?? crypto.randomBytes(24).toString('base64url');
    const cart = await this.prisma.cart.create({ data: { anonymousToken: token } });
    return { cart, createdToken: token };
  }

  /**
   * On login: move the anonymous cart into the user's cart. Reservations move
   * with their items and their timers are NOT reset (spec requirement).
   */
  async mergeAnonymousCartIntoUser(anonymousToken: string, userId: string): Promise<void> {
    const anonCart = await this.prisma.cart.findFirst({
      where: { anonymousToken, status: 'ACTIVE' },
      include: { items: true },
    });
    if (!anonCart) return;

    if (anonCart.items.length === 0) {
      await this.prisma.cart.update({ where: { id: anonCart.id }, data: { status: 'MERGED' } });
      return;
    }

    const { cart: userCart } = await this.getOrCreateCart({ userId });
    const userItems = await this.prisma.cartItem.findMany({ where: { cartId: userCart.id } });
    const userVariantIds = new Set(userItems.map((i) => i.variantId));

    for (const item of anonCart.items) {
      if (userVariantIds.has(item.variantId)) {
        // Keep the user's existing line; release the duplicate hold.
        const reservation = await this.prisma.inventoryReservation.findFirst({
          where: { cartItemId: item.id, status: { in: ['ACTIVE', 'CHECKOUT_STARTED'] } },
        });
        if (reservation) {
          await this.reservations.release(reservation.id, 'CANCELLED', 'Cart merged after login');
        } else {
          await this.prisma.cartItem.delete({ where: { id: item.id } }).catch(() => undefined);
        }
      } else {
        await this.prisma.cartItem.update({
          where: { id: item.id },
          data: { cartId: userCart.id },
        });
        await this.prisma.inventoryReservation.updateMany({
          where: { cartItemId: item.id },
          data: { cartId: userCart.id, userId },
        });
      }
    }
    await this.prisma.cart.update({ where: { id: anonCart.id }, data: { status: 'MERGED' } });
  }

  // --- Cart mutation -------------------------------------------------------

  async addItem(
    identity: CartIdentity,
    input: { variantId: string; quantity: number; campaignId?: string | null },
  ): Promise<{ createdToken?: string }> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant || !variant.isEnabled) throw new NotFoundException('Product variant not found.');
    const product = variant.product;
    const now = new Date();
    const published =
      product.status === 'ACTIVE' &&
      (!product.publishedFrom || product.publishedFrom <= now) &&
      (!product.publishedUntil || product.publishedUntil > now);
    if (!published) throw new BadRequestException('This product is not available.');

    let campaignId: string | null = null;
    if (input.campaignId) {
      const campaignProduct = await this.prisma.campaignProduct.findUnique({
        where: { campaignId_productId: { campaignId: input.campaignId, productId: product.id } },
        include: { campaign: true },
      });
      if (campaignProduct && isCampaignRunning(campaignProduct.campaign, now)) {
        campaignId = input.campaignId;
        if (
          campaignProduct.maxQuantityPerOrder != null &&
          input.quantity > campaignProduct.maxQuantityPerOrder
        ) {
          throw new BadRequestException(
            `This campaign allows at most ${campaignProduct.maxQuantityPerOrder} per order.`,
          );
        }
      }
    }

    const { cart, createdToken } = await this.getOrCreateCart(identity);
    await this.reservations.expireDueForCart(cart.id);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });

    if (existing) {
      await this.changeItemQuantity(cart.id, existing.id, existing.quantity + input.quantity);
      return { createdToken };
    }

    const unitPrice = await this.currentUnitPrice(variant.id, campaignId);
    const item = await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: variant.id,
        campaignId,
        quantity: input.quantity,
        unitPriceMinor: unitPrice,
      },
    });

    try {
      await this.reservations.reserve({
        cartId: cart.id,
        cartItemId: item.id,
        variantId: variant.id,
        quantity: input.quantity,
        userId: identity.userId ?? null,
        sessionToken: identity.cartToken ?? null,
      });
    } catch (err) {
      // No stock could be held — remove the dangling line and propagate.
      await this.prisma.cartItem.delete({ where: { id: item.id } }).catch(() => undefined);
      throw err;
    }
    return { createdToken };
  }

  async changeItemQuantity(cartId: string, itemId: string, newQuantity: number): Promise<void> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
    });
    if (!item) throw new NotFoundException('Cart item not found.');

    if (newQuantity <= 0) {
      await this.removeItem(cartId, itemId);
      return;
    }
    if (newQuantity > 10) throw new BadRequestException('Maximum 10 units per item.');

    const reservation = await this.prisma.inventoryReservation.findFirst({
      where: { cartItemId: itemId, status: { in: ['ACTIVE', 'CHECKOUT_STARTED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!reservation || reservation.expiresAt <= new Date()) {
      throw new BadRequestException(
        'The reservation for this item has expired. Please add it to the cart again.',
      );
    }
    await this.reservations.adjustQuantity(reservation.id, newQuantity);
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: newQuantity } });
  }

  async removeItem(cartId: string, itemId: string): Promise<void> {
    const reservation = await this.prisma.inventoryReservation.findFirst({
      where: { cartItemId: itemId, status: { in: ['ACTIVE', 'CHECKOUT_STARTED'] } },
    });
    if (reservation) {
      // release() also deletes the cart line.
      await this.reservations.release(reservation.id, 'CANCELLED', 'Removed from cart');
    } else {
      await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
    }
  }

  async applyCoupon(identity: CartIdentity, code: string): Promise<string | null> {
    const cart = await this.findActiveCart(identity);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new BadRequestException('Unknown coupon code.');

    const customerStats = await this.customerCouponStats(identity.userId ?? null, coupon.id);
    const lines = cart.items.map((item) => ({
      productId: item.variant.productId,
      brandId: item.variant.product.brandId,
      categoryId: item.variant.product.categoryId,
      campaignId: item.campaignId,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
    }));
    const result = validateCoupon(coupon, lines, customerStats);
    if (!result.valid) throw new BadRequestException(result.reason);

    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    return coupon.code;
  }

  async removeCoupon(identity: CartIdentity): Promise<void> {
    const cart = await this.findActiveCart(identity);
    if (cart) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    }
  }

  async customerCouponStats(userId: string | null, couponId: string) {
    if (!userId) return { customerOrderCount: 0, customerRedemptionsOfThisCoupon: 0 };
    const [orderCount, redemptions] = await Promise.all([
      this.prisma.order.count({
        where: { userId, status: { notIn: ['DRAFT', 'AWAITING_PAYMENT', 'CANCELLED'] } },
      }),
      this.prisma.order.count({
        where: { userId, couponId, status: { notIn: ['DRAFT', 'AWAITING_PAYMENT', 'CANCELLED'] } },
      }),
    ]);
    return { customerOrderCount: orderCount, customerRedemptionsOfThisCoupon: redemptions };
  }

  // --- Cart view -----------------------------------------------------------

  private async currentUnitPrice(variantId: string, campaignId: string | null): Promise<number> {
    const variant = await this.prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { product: true },
    });
    let campaignPrice: number | null = null;
    let campaignRunning = false;
    if (campaignId) {
      const cp = await this.prisma.campaignProduct.findUnique({
        where: { campaignId_productId: { campaignId, productId: variant.productId } },
        include: { campaign: true },
      });
      if (cp) {
        campaignPrice = cp.campaignPriceMinor;
        campaignRunning = isCampaignRunning(cp.campaign);
      }
    }
    return effectiveUnitPriceMinor({
      outletPriceMinor: variant.product.outletPriceMinor,
      originalPriceMinor: variant.product.originalPriceMinor,
      variantPriceOverrideMinor: variant.priceOverrideMinor,
      campaignPriceMinor: campaignPrice,
      campaignIsRunning: campaignRunning,
    });
  }

  /** Authoritative cart view: expires due holds, reprices, and totals. */
  async getCartView(identity: CartIdentity): Promise<CartDto> {
    const cart = await this.findActiveCart(identity);
    if (!cart) return this.emptyCart();

    const messages: string[] = [];
    const expired = await this.reservations.expireDueForCart(cart.id);
    if (expired > 0) {
      messages.push(
        expired === 1
          ? 'One reserved item expired and was removed from your cart.'
          : `${expired} reserved items expired and were removed from your cart.`,
      );
    }

    const fresh = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: CART_INCLUDE,
    });

    const now = new Date();
    const items: CartItemDto[] = [];
    const savedForLater: CartItemDto[] = [];
    for (const item of fresh.items) {
      const currentPrice = await this.currentUnitPrice(item.variantId, item.campaignId);
      if (currentPrice !== item.unitPriceMinor) {
        await this.prisma.cartItem.update({
          where: { id: item.id },
          data: { unitPriceMinor: currentPrice },
        });
        messages.push(`The price of "${item.variant.product.name}" was updated.`);
        item.unitPriceMinor = currentPrice;
      }

      const reservation = await this.prisma.inventoryReservation.findFirst({
        where: {
          cartItemId: item.id,
          status: { in: ['ACTIVE', 'CHECKOUT_STARTED', 'PAYMENT_PROCESSING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      const image = item.variant.product.images[0];
      // Saved items hold no reservation by design, so the "expired" wording the
      // active lines use would be misleading on them.
      const target = item.savedForLater ? savedForLater : items;
      target.push({
        id: item.id,
        variantId: item.variantId,
        productId: item.variant.productId,
        productSlug: item.variant.product.slug,
        productName: item.variant.product.name,
        brandName: item.variant.product.brand.name,
        sku: item.variant.sku,
        size: item.variant.size,
        color: item.variant.color,
        imageUrl: image?.url ?? null,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        originalUnitPriceMinor: item.variant.product.originalPriceMinor,
        lineTotalMinor: item.unitPriceMinor * item.quantity,
        campaignId: item.campaignId,
        campaignTitle: item.campaign?.title ?? null,
        reservation:
          reservation && !item.savedForLater
            ? {
                id: reservation.id,
                status: reservation.status,
                expiresAt: reservation.expiresAt.toISOString(),
                secondsRemaining: secondsRemaining(reservation.expiresAt, now),
              }
            : null,
        isExpired: item.savedForLater ? false : !reservation,
        message: item.savedForLater || reservation ? null : 'Reservation expired',
      });
    }

    const settings = await this.settings.get();
    let couponCode: string | null = null;
    let couponForTotals = null as null | {
      type: 'FIXED' | 'PERCENTAGE';
      value: number;
      minOrderMinor?: number | null;
      maxDiscountMinor?: number | null;
    };
    let eligibility: Set<string> | null = null;

    if (fresh.coupon) {
      // Saved items are not being bought, so they must not help a coupon reach
      // its minimum order value or count toward its restrictions.
      const activeItems = fresh.items.filter((item) => !item.savedForLater);
      const stats = await this.customerCouponStats(identity.userId ?? null, fresh.coupon.id);
      const lines = activeItems.map((item) => ({
        productId: item.variant.productId,
        brandId: item.variant.product.brandId,
        categoryId: item.variant.product.categoryId,
        campaignId: item.campaignId,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
      }));
      const result = validateCoupon(fresh.coupon, lines, stats);
      if (result.valid) {
        couponCode = fresh.coupon.code;
        couponForTotals = fresh.coupon;
        eligibility = new Set(
          activeItems
            .filter((item) => {
              const hasRestrictions =
                fresh.coupon!.brandIds.length > 0 ||
                fresh.coupon!.categoryIds.length > 0 ||
                fresh.coupon!.productIds.length > 0 ||
                fresh.coupon!.campaignIds.length > 0;
              if (!hasRestrictions) return true;
              return (
                fresh.coupon!.productIds.includes(item.variant.productId) ||
                fresh.coupon!.brandIds.includes(item.variant.product.brandId) ||
                (item.variant.product.categoryId
                  ? fresh.coupon!.categoryIds.includes(item.variant.product.categoryId)
                  : false) ||
                (item.campaignId ? fresh.coupon!.campaignIds.includes(item.campaignId) : false)
              );
            })
            .map((i) => i.id),
        );
      } else {
        messages.push(`Coupon removed: ${result.reason}`);
        await this.prisma.cart.update({ where: { id: fresh.id }, data: { couponId: null } });
      }
    }

    const totals = computeCartTotals({
      lines: items.map((i) => ({
        unitPriceMinor: i.unitPriceMinor,
        quantity: i.quantity,
        eligibleForCoupon: eligibility ? eligibility.has(i.id) : true,
      })),
      coupon: couponForTotals,
      shippingRules: {
        standardShippingMinor: settings.standardShippingMinor,
        expressShippingMinor: settings.expressShippingMinor,
        freeShippingThresholdMinor: settings.freeShippingThresholdMinor,
      },
      shippingMethod: 'STANDARD',
      taxRateBps: settings.taxRateBps,
    });

    return {
      id: fresh.id,
      items,
      savedForLater,
      currencyCode: fresh.currencyCode,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.couponDiscountMinor,
      shippingMinor: items.length > 0 ? totals.shippingMinor : 0,
      taxMinor: totals.taxMinor,
      totalMinor: items.length > 0 ? totals.totalMinor : 0,
      couponCode,
      couponDiscountMinor: totals.couponDiscountMinor,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      freeShipping: freeShippingProgress(
        {
          standardShippingMinor: settings.standardShippingMinor,
          expressShippingMinor: settings.expressShippingMinor,
          freeShippingThresholdMinor: settings.freeShippingThresholdMinor,
        },
        totals.subtotalMinor - totals.couponDiscountMinor,
      ),
      deliveryEstimate:
        items.length === 0
          ? null
          : { ...deliveryEstimate('STANDARD', now), method: 'STANDARD' as const },
      messages,
    };
  }

  /**
   * Park a line. The reservation is released immediately — holding stock for an
   * item the customer has explicitly set aside would starve buyers who want it
   * now, which is the opposite of what the feature is for.
   */
  async saveForLater(identity: CartIdentity, itemId: string): Promise<void> {
    const cart = await this.findActiveCart(identity);
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');
    if (item.savedForLater) return;

    await this.reservations.releaseForCartItem(item.id);
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { savedForLater: true },
    });
  }

  /**
   * Move a parked line back into the cart. Stock is re-checked and a new
   * reservation taken, because nothing was held while it sat in saved items.
   */
  async moveToCart(identity: CartIdentity, itemId: string): Promise<void> {
    const cart = await this.findActiveCart(identity);
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Saved item not found');
    if (!item.savedForLater) return;

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { savedForLater: false },
    });

    try {
      await this.reservations.reserve({
        cartId: cart.id,
        cartItemId: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        userId: identity.userId ?? null,
        sessionToken: identity.cartToken ?? null,
      });
    } catch (error) {
      // Could not re-reserve — park it again so the cart never contains a line
      // with no hold behind it.
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { savedForLater: true },
      });
      throw error;
    }
  }

  private emptyCart(): CartDto {
    return {
      id: '',
      items: [],
      savedForLater: [],
      currencyCode: 'EUR',
      subtotalMinor: 0,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      couponCode: null,
      couponDiscountMinor: 0,
      itemCount: 0,
      freeShipping: { thresholdMinor: 0, remainingMinor: 0, qualified: false },
      deliveryEstimate: null,
      messages: [],
    };
  }
}
