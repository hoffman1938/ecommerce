import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createReturnSchema,
  notificationPreferencesSchema,
  savedAddressSchema,
  updateProfileSchema,
  type CreateReturnInput,
  type NotificationPreferencesInput,
  type SavedAddressInput,
  type UpdateProfileInput,
} from '@outlet/validation';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { RequestUser } from '../../common/request-user';
import { OrdersService } from '../orders/orders.service';
import { ReturnsService } from '../returns/returns.service';

const wishlistAddSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional().nullable(),
});

@ApiTags('account')
@Controller('account')
@UseGuards(SessionAuthGuard)
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly returns: ReturnsService,
  ) {}

  // --- Profile --------------------------------------------------------------

  @Get('profile')
  @ApiOperation({ summary: 'Account overview' })
  async profile(@CurrentUser() user: RequestUser) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      isEmailVerified: dbUser.isEmailVerified,
      createdAt: dbUser.createdAt.toISOString(),
      notificationPreferences: {
        orderUpdates: dbUser.notifyOrderUpdates,
        campaignAnnouncements: dbUser.notifyCampaigns,
        newsletter: dbUser.newsletterOptIn,
      },
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update personal information' })
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { firstName: body.firstName, lastName: body.lastName },
    });
    return { message: 'Profile updated.' };
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updateNotifications(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(notificationPreferencesSchema)) body: NotificationPreferencesInput,
  ) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        notifyOrderUpdates: body.orderUpdates,
        notifyCampaigns: body.campaignAnnouncements,
        newsletterOptIn: body.newsletter,
      },
    });
    return { message: 'Preferences updated.' };
  }

  // --- Addresses ------------------------------------------------------------

  @Get('addresses')
  @ApiOperation({ summary: 'Saved addresses' })
  listAddresses(@CurrentUser() user: RequestUser) {
    return this.prisma.address.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('addresses')
  @HttpCode(201)
  @ApiOperation({ summary: 'Save a new address' })
  async createAddress(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(savedAddressSchema)) body: SavedAddressInput,
  ) {
    if (body.isDefaultShipping) {
      await this.prisma.address.updateMany({
        where: { userId: user.id },
        data: { isDefaultShipping: false },
      });
    }
    if (body.isDefaultBilling) {
      await this.prisma.address.updateMany({
        where: { userId: user.id },
        data: { isDefaultBilling: false },
      });
    }
    return this.prisma.address.create({ data: { ...body, userId: user.id } });
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Update a saved address' })
  async updateAddress(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savedAddressSchema)) body: SavedAddressInput,
  ) {
    const address = await this.prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!address) throw new NotFoundException('Address not found');
    return this.prisma.address.update({ where: { id }, data: body });
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Delete a saved address' })
  async deleteAddress(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    return { message: 'Address deleted.' };
  }

  // --- Orders ---------------------------------------------------------------

  @Get('orders')
  @ApiOperation({ summary: 'Order history' })
  listOrders(@CurrentUser() user: RequestUser) {
    return this.orders.listOrdersForUser(user.id);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Order details incl. payments, shipments, returnable quantities' })
  getOrder(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.orders.getOrderForUser(id, user.id);
  }

  // --- Returns --------------------------------------------------------------

  @Get('returns')
  @ApiOperation({ summary: 'My return requests and refund status' })
  listReturns(@CurrentUser() user: RequestUser) {
    return this.returns.listForCustomer(user.id);
  }

  @Post('returns')
  @HttpCode(201)
  @ApiOperation({ summary: 'Request a return for a shipped/delivered order' })
  createReturn(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createReturnSchema)) body: CreateReturnInput,
  ) {
    return this.returns.createForCustomer(user.id, body);
  }

  // --- Wishlist -------------------------------------------------------------

  @Get('wishlist')
  @ApiOperation({ summary: 'Wishlist items' })
  async wishlist(@CurrentUser() user: RequestUser) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: {
              include: { brand: true, images: { orderBy: { position: 'asc' }, take: 1 } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return (wishlist?.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      slug: item.product.slug,
      brandName: item.product.brand.name,
      imageUrl: item.product.images[0]?.url ?? null,
      outletPriceMinor: item.product.outletPriceMinor,
      originalPriceMinor: item.product.originalPriceMinor,
      addedAt: item.createdAt.toISOString(),
    }));
  }

  @Post('wishlist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a product to the wishlist' })
  async addToWishlist(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(wishlistAddSchema)) body: z.infer<typeof wishlistAddSchema>,
  ) {
    const wishlist = await this.prisma.wishlist.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId: { wishlistId: wishlist.id, productId: body.productId },
      },
      create: {
        wishlistId: wishlist.id,
        productId: body.productId,
        variantId: body.variantId ?? null,
      },
      update: {},
    });
    return { message: 'Added to wishlist.' };
  }

  @Delete('wishlist/:productId')
  @ApiOperation({ summary: 'Remove a product from the wishlist' })
  async removeFromWishlist(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    const wishlist = await this.prisma.wishlist.findUnique({ where: { userId: user.id } });
    if (wishlist) {
      await this.prisma.wishlistItem.deleteMany({
        where: { wishlistId: wishlist.id, productId },
      });
    }
    return { message: 'Removed from wishlist.' };
  }

  // --- Notifications --------------------------------------------------------

  @Get('notifications')
  @ApiOperation({ summary: 'In-app notifications' })
  listNotifications(@CurrentUser() user: RequestUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
