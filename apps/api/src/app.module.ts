import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfig } from '@outlet/config';
import { CommonModule } from './common/common.module';
import { SessionService } from './common/session.service';
import { SessionAuthGuard } from './common/auth.guard';

import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { CampaignsController } from './modules/campaigns/campaigns.controller';
import { CartController } from './modules/cart/cart.controller';
import { CartService } from './modules/cart/cart.service';
import { ReservationsService } from './modules/reservations/reservations.service';
import { CheckoutController } from './modules/checkout/checkout.controller';
import { CheckoutService } from './modules/checkout/checkout.service';
import { OrdersService } from './modules/orders/orders.service';
import { PaymentsController } from './modules/payments/payments.controller';
import { PaymentsService } from './modules/payments/payments.service';
import { AccountController } from './modules/account/account.controller';
import { ReturnsService } from './modules/returns/returns.service';
import { ContentController } from './modules/content/content.controller';
import { HealthController } from './modules/health/health.controller';

import { AdminCatalogController } from './modules/admin/admin-catalog.controller';
import { AdminCatalogService } from './modules/admin/admin-catalog.service';
import { AdminInventoryController } from './modules/admin/admin-inventory.controller';
import { AdminInventoryService } from './modules/admin/admin-inventory.service';
import { AdminCampaignsController } from './modules/admin/admin-campaigns.controller';
import { AdminOrdersController } from './modules/admin/admin-orders.controller';
import { AdminCustomersController } from './modules/admin/admin-customers.controller';
import { AdminCouponsController } from './modules/admin/admin-coupons.controller';
import { AdminReviewsController } from './modules/admin/admin-reviews.controller';
import { AdminReviewsService } from './modules/admin/admin-reviews.service';
import { AdminReturnsController } from './modules/admin/admin-returns.controller';
import { AdminMiscController } from './modules/admin/admin-misc.controller';
import { AdminDashboardService } from './modules/admin/admin-dashboard.service';

const config = loadConfig();

/**
 * Modular monolith: one deployable API composed of feature modules. Feature
 * folders keep domains separated; DI providers are registered centrally so
 * the dependency graph stays explicit and cycle-free.
 */
@Module({
  imports: [
    CommonModule,
    ThrottlerModule.forRoot([
      {
        ttl: config.rateLimit.windowSeconds * 1000,
        limit: config.rateLimit.maxRequests,
      },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    CampaignsController,
    CartController,
    CheckoutController,
    PaymentsController,
    AccountController,
    ContentController,
    AdminCatalogController,
    AdminInventoryController,
    AdminCampaignsController,
    AdminOrdersController,
    AdminCustomersController,
    AdminCouponsController,
    AdminReturnsController,
    AdminReviewsController,
    AdminMiscController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    SessionService,
    SessionAuthGuard,
    AuthService,
    CatalogService,
    CartService,
    ReservationsService,
    CheckoutService,
    OrdersService,
    PaymentsService,
    ReturnsService,
    AdminCatalogService,
    AdminInventoryService,
    AdminDashboardService,
    AdminReviewsService,
  ],
})
export class AppModule {}
