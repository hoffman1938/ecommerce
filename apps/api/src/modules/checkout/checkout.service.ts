import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { AppConfig } from '@outlet/config';
import { computeCartTotals, validateCoupon } from '@outlet/domain';
import type { PaymentProvider } from '@outlet/payments';
import type { CheckoutQuoteDto, PaymentSessionDto, ShippingMethodDto } from '@outlet/types';
import type { CheckoutSubmitInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../../common/settings.service';
import { APP_CONFIG, PAYMENT_PROVIDER } from '../../common/tokens';
import { CartService, type CartIdentity } from '../cart/cart.service';
import { ReservationsService } from '../reservations/reservations.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly reservations: ReservationsService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  private async shippingMethods(): Promise<ShippingMethodDto[]> {
    const s = await this.settings.get();
    return [
      {
        id: 'STANDARD',
        label: 'Standard delivery',
        priceMinor: s.standardShippingMinor,
        estimatedDays: '3-5 business days',
      },
      {
        id: 'EXPRESS',
        label: 'Express delivery',
        priceMinor: s.expressShippingMinor,
        estimatedDays: '1-2 business days',
      },
    ];
  }

  /**
   * Checkout start: validates the cart, marks reservations CHECKOUT_STARTED
   * (never extending them — extensions would be an abuse vector), and returns
   * the authoritative quote.
   */
  async startCheckout(identity: CartIdentity): Promise<CheckoutQuoteDto> {
    const cartView = await this.carts.getCartView(identity);
    if (cartView.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }
    const expired = cartView.items.filter((i) => i.isExpired);
    if (expired.length > 0) {
      throw new ConflictException({
        code: 'RESERVATIONS_EXPIRED',
        message: 'Some reservations expired. Please review your cart.',
      });
    }
    await this.reservations.markCheckoutStarted(cartView.id);

    const live = await this.reservations.liveReservationsForCart(cartView.id);
    const deadline =
      live.length > 0
        ? live.reduce((min, r) => (r.expiresAt < min ? r.expiresAt : min), live[0].expiresAt)
        : null;

    return {
      cart: await this.carts.getCartView(identity),
      shippingMethods: await this.shippingMethods(),
      reservationDeadline: deadline?.toISOString() ?? null,
    };
  }

  /**
   * Final submission. Everything the browser sent is re-validated and every
   * total re-derived server-side; `expectedTotalMinor` only detects UI drift
   * (mismatch => 409 so the customer can review, never silent acceptance).
   */
  async submit(identity: CartIdentity, input: CheckoutSubmitInput): Promise<PaymentSessionDto> {
    // Idempotent retry: same key returns a session for the same order.
    const existing = await this.prisma.order.findUnique({
      where: { checkoutIdempotencyKey: input.idempotencyKey },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existing) {
      const payment = existing.payments[0];
      if (!payment) throw new ConflictException('Order already exists without payment.');
      const session = await this.paymentProvider.createPayment({
        paymentId: payment.id,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        amountMinor: payment.amountMinor,
        currencyCode: existing.currencyCode,
        customerEmail: existing.email,
        returnUrl: `${this.config.urls.storefront}/checkout/result?orderId=${existing.id}`,
        webhookUrl: `${this.config.urls.api}/payments/webhook/${this.paymentProvider.name}`,
        idempotencyKey: input.idempotencyKey,
      });
      return {
        paymentId: payment.id,
        orderId: existing.id,
        provider: session.provider,
        redirectUrl: session.redirectUrl,
        amountMinor: payment.amountMinor,
        currencyCode: existing.currencyCode,
      };
    }

    const cart = await this.carts.findActiveCart(identity);
    if (!cart || cart.items.length === 0) throw new BadRequestException('Your cart is empty.');
    await this.reservations.expireDueForCart(cart.id);

    const cartView = await this.carts.getCartView(identity);
    if (cartView.items.length === 0 || cartView.items.some((i) => i.isExpired)) {
      throw new ConflictException({
        code: 'RESERVATIONS_EXPIRED',
        message: 'Your reservations expired during checkout. Please review your cart.',
      });
    }

    const settings = await this.settings.get();
    const fullCart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: {
        coupon: true,
        items: { include: { variant: { include: { product: { include: { brand: true, images: { orderBy: { position: 'asc' }, take: 1 } } } } }, campaign: true } },
      },
    });

    // Coupon re-validation at the moment of purchase.
    let coupon = fullCart.coupon;
    let eligibleItemIds: Set<string> | null = null;
    if (coupon) {
      const stats = await this.carts.customerCouponStats(identity.userId ?? null, coupon.id);
      const lines = fullCart.items.map((item) => ({
        productId: item.variant.productId,
        brandId: item.variant.product.brandId,
        categoryId: item.variant.product.categoryId,
        campaignId: item.campaignId,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
      }));
      const result = validateCoupon(coupon, lines, stats);
      if (!result.valid) {
        coupon = null;
        await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
      } else {
        const hasRestrictions =
          coupon.brandIds.length > 0 ||
          coupon.categoryIds.length > 0 ||
          coupon.productIds.length > 0 ||
          coupon.campaignIds.length > 0;
        eligibleItemIds = new Set(
          fullCart.items
            .filter(
              (item) =>
                !hasRestrictions ||
                coupon!.productIds.includes(item.variant.productId) ||
                coupon!.brandIds.includes(item.variant.product.brandId) ||
                (item.variant.product.categoryId
                  ? coupon!.categoryIds.includes(item.variant.product.categoryId)
                  : false) ||
                (item.campaignId ? coupon!.campaignIds.includes(item.campaignId) : false),
            )
            .map((i) => i.id),
        );
      }
    }

    const totals = computeCartTotals({
      lines: fullCart.items.map((item) => ({
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
        eligibleForCoupon: eligibleItemIds ? eligibleItemIds.has(item.id) : true,
      })),
      coupon,
      shippingRules: {
        standardShippingMinor: settings.standardShippingMinor,
        expressShippingMinor: settings.expressShippingMinor,
        freeShippingThresholdMinor: settings.freeShippingThresholdMinor,
      },
      shippingMethod: input.shippingMethod,
      taxRateBps: settings.taxRateBps,
    });

    if (totals.totalMinor !== input.expectedTotalMinor) {
      throw new ConflictException({
        code: 'TOTALS_CHANGED',
        message: 'Prices changed while you were checking out. Please review the new total.',
        totals,
      });
    }

    const billingAddress = input.billingSameAsShipping
      ? input.shippingAddress
      : input.billingAddress;

    const { order, payment } = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.orders.nextOrderNumber(tx);
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: identity.userId ?? null,
          email: input.email,
          status: 'AWAITING_PAYMENT',
          currencyCode: fullCart.currencyCode,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.couponDiscountMinor,
          shippingMinor: totals.shippingMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          shippingAddress: input.shippingAddress,
          billingAddress,
          shippingMethod: input.shippingMethod,
          customerNote: input.customerNote,
          checkoutIdempotencyKey: input.idempotencyKey,
          items: {
            create: fullCart.items.map((item) => {
              const lineTotal = item.unitPriceMinor * item.quantity;
              return {
                variantId: item.variantId,
                campaignId: item.campaignId,
                productSnapshot: {
                  productId: item.variant.productId,
                  productName: item.variant.product.name,
                  productSlug: item.variant.product.slug,
                  brandName: item.variant.product.brand.name,
                  sku: item.variant.sku,
                  size: item.variant.size,
                  color: item.variant.color,
                  imageUrl: item.variant.product.images[0]?.url ?? null,
                  campaignTitle: item.campaign?.title ?? null,
                },
                sku: item.variant.sku,
                name: item.variant.product.name,
                quantity: item.quantity,
                unitPriceMinor: item.unitPriceMinor,
                originalUnitPriceMinor: item.variant.product.originalPriceMinor,
                taxRateBps: settings.taxRateBps,
                taxMinor: Math.round(
                  (lineTotal * settings.taxRateBps) / (10000 + settings.taxRateBps),
                ),
                totalMinor: lineTotal,
              };
            }),
          },
          statusHistory: { create: { toStatus: 'AWAITING_PAYMENT' } },
        },
      });
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: this.paymentProvider.name,
          status: 'PENDING',
          amountMinor: totals.totalMinor,
          currencyCode: fullCart.currencyCode,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { order, payment };
    });

    // Attach reservations to the order for conversion on payment success.
    await this.reservations.markPaymentProcessing(cart.id, order.id);

    const session = await this.paymentProvider.createPayment({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: payment.amountMinor,
      currencyCode: order.currencyCode,
      customerEmail: order.email,
      returnUrl: `${this.config.urls.storefront}/checkout/result?orderId=${order.id}`,
      webhookUrl: `${this.config.urls.api}/payments/webhook/${this.paymentProvider.name}`,
      idempotencyKey: input.idempotencyKey,
    });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId: session.providerPaymentId },
    });

    return {
      paymentId: payment.id,
      orderId: order.id,
      provider: session.provider,
      redirectUrl: session.redirectUrl,
      amountMinor: payment.amountMinor,
      currencyCode: order.currencyCode,
    };
  }
}
