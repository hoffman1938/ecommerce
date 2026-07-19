import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import type { ObjectStorageProvider } from '@outlet/storage';
import {
  brandInputSchema,
  categoryInputSchema,
  productInputSchema,
  variantInputSchema,
  paginationSchema,
  type BrandInput,
  type CategoryInput,
  type ProductInput,
  type VariantInput,
} from '@outlet/validation';
import { Permissions } from '@outlet/types';
import { AdminCatalogService } from './admin-catalog.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { STORAGE_PROVIDER } from '../../common/tokens';
import type { RequestUser } from '../../common/request-user';
import { PrismaService } from '../../common/prisma.service';

const listQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED']).optional(),
});

const imageAttachSchema = z.object({
  url: z.string().url(),
  objectKey: z.string().optional().nullable(),
  altText: z.string().max(300).optional().nullable(),
  variantId: z.string().optional().nullable(),
});

const reorderSchema = z.object({ imageIds: z.array(z.string()).min(1) });
const enabledSchema = z.object({ isEnabled: z.boolean() });
const csvSchema = z.object({ csv: z.string().min(1) });

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('admin')
@Controller('admin')
@UseGuards(SessionAuthGuard)
export class AdminCatalogController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {}

  private actor(user: RequestUser) {
    return { userId: user.id, email: user.email };
  }

  // --- Products -------------------------------------------------------------

  @Get('products')
  @RequirePermissions(Permissions.ProductsView)
  @ApiOperation({ summary: 'Admin product list with search' })
  listProducts(@Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:id')
  @RequirePermissions(Permissions.ProductsView)
  @ApiOperation({ summary: 'Admin product detail' })
  getProduct(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Post('products')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsCreate)
  @ApiOperation({ summary: 'Create a product' })
  createProduct(
    @Body(new ZodValidationPipe(productInputSchema)) body: ProductInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.createProduct(body, this.actor(user));
  }

  @Put('products/:id')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Update a product (incl. status, prices, SEO, scheduling)' })
  updateProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productInputSchema)) body: ProductInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.updateProduct(id, body, this.actor(user));
  }

  @Post('products/:id/duplicate')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsCreate)
  @ApiOperation({ summary: 'Duplicate a product as a draft' })
  duplicateProduct(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.catalog.duplicateProduct(id, this.actor(user));
  }

  @Post('products/:id/archive')
  @RequirePermissions(Permissions.ProductsArchive)
  @ApiOperation({ summary: 'Archive a product' })
  archiveProduct(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.catalog.archiveProduct(id, this.actor(user));
  }

  // --- Variants -------------------------------------------------------------

  @Post('products/:id/variants')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Create or update a variant (pass id to update)' })
  upsertVariant(
    @Param('id') productId: string,
    @Body(new ZodValidationPipe(variantInputSchema)) body: VariantInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.upsertVariant(productId, body, this.actor(user));
  }

  @Patch('variants/:variantId/enabled')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Enable/disable a variant' })
  setVariantEnabled(
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(enabledSchema)) body: z.infer<typeof enabledSchema>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.setVariantEnabled(variantId, body.isEnabled, this.actor(user));
  }

  // --- Uploads & images -----------------------------------------------------

  @Post('uploads')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsUpdate)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image to object storage (MinIO locally)' })
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    if (!file) throw new BadRequestException('No file provided (field name: "file").');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only PNG, JPEG, WebP, and SVG images are allowed.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File exceeds the 5 MB upload limit.');
    }
    const extension = file.originalname.includes('.')
      ? file.originalname.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
      : 'bin';
    const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const stored = await this.storage.upload({
      objectKey,
      body: file.buffer,
      mimeType: file.mimetype,
    });
    await this.prisma.uploadedFile.create({
      data: {
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: user.id,
      },
    });
    return { url: stored.url, objectKey: stored.objectKey };
  }

  @Post('products/:id/images')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Attach an uploaded image to a product' })
  addImage(
    @Param('id') productId: string,
    @Body(new ZodValidationPipe(imageAttachSchema)) body: z.infer<typeof imageAttachSchema>,
  ) {
    return this.catalog.addImage(productId, body);
  }

  @Put('products/:id/images/order')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Reorder product images' })
  reorderImages(
    @Param('id') productId: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>,
  ) {
    return this.catalog.reorderImages(productId, body.imageIds);
  }

  @Delete('products/:id/images/:imageId')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Remove a product image' })
  async deleteImage(@Param('id') productId: string, @Param('imageId') imageId: string) {
    await this.catalog.deleteImage(productId, imageId);
    return { message: 'Image removed.' };
  }

  // --- Brands & categories --------------------------------------------------

  @Get('brands')
  @RequirePermissions(Permissions.ProductsView)
  @ApiOperation({ summary: 'All brands (incl. inactive)' })
  listBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('brands')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Create a brand' })
  createBrand(
    @Body(new ZodValidationPipe(brandInputSchema)) body: BrandInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.upsertBrand(body, this.actor(user));
  }

  @Put('brands/:id')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Update a brand' })
  updateBrand(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(brandInputSchema)) body: BrandInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.upsertBrand({ ...body, id }, this.actor(user));
  }

  @Get('categories')
  @RequirePermissions(Permissions.ProductsView)
  @ApiOperation({ summary: 'All categories (flat)' })
  listCategories() {
    return this.prisma.category.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  }

  @Post('categories')
  @HttpCode(201)
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Create a category' })
  createCategory(
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.upsertCategory(body, this.actor(user));
  }

  @Put('categories/:id')
  @RequirePermissions(Permissions.ProductsUpdate)
  @ApiOperation({ summary: 'Update a category' })
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.upsertCategory({ ...body, id }, this.actor(user));
  }

  // --- CSV ------------------------------------------------------------------

  @Get('products/export/csv')
  @RequirePermissions(Permissions.ProductsView)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="products.csv"')
  @ApiOperation({ summary: 'Export products + variants as CSV' })
  exportCsv() {
    return this.catalog.exportProductsCsv();
  }

  @Post('products/import/csv')
  @RequirePermissions(Permissions.ProductsCreate)
  @ApiOperation({ summary: 'Import products/variants from CSV text' })
  importCsv(
    @Body(new ZodValidationPipe(csvSchema)) body: z.infer<typeof csvSchema>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.catalog.importProductsCsv(body.csv, this.actor(user));
  }
}
