import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  productQuerySchema,
  reviewQuerySchema,
  type ProductQueryInput,
  type ReviewQueryInput,
} from '@outlet/validation';
import { CatalogService } from './catalog.service';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('brands')
  @ApiOperation({ summary: 'Active brands' })
  listBrands() {
    return this.catalog.listBrands();
  }

  @Get('categories')
  @ApiOperation({
    summary:
      'Customer-facing category tree (department → category → subcategory). Hidden and empty branches are already removed.',
  })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('categories/path')
  @ApiOperation({
    summary: 'Resolve a storefront path such as women/clothing/dresses to its breadcrumb trail',
  })
  async resolveCategoryPath(@Query('path') path?: string) {
    const segments = (path ?? '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, 3);
    const trail = await this.catalog.resolveCategoryPath(segments);
    if (!trail) throw new NotFoundException('Category not found');
    return trail;
  }

  @Get('suggest')
  @ApiOperation({ summary: 'Type-ahead suggestions for products, brands and categories' })
  suggest(@Query('q') q?: string) {
    return this.catalog.suggest((q ?? '').slice(0, 200));
  }

  @Get('recommended')
  @ApiOperation({ summary: 'Recommendations from browsing signals' })
  recommended(
    @Query('recent') recent?: string,
    @Query('wishlist') wishlist?: string,
    @Query('cart') cart?: string,
    @Query('limit') limit?: string,
  ) {
    const slugs = (value?: string) => (value ? value.split(',').filter(Boolean).slice(0, 20) : []);
    return this.catalog.recommended(
      { recentSlugs: slugs(recent), wishlistSlugs: slugs(wishlist), cartSlugs: slugs(cart) },
      Math.min(12, Math.max(1, Number(limit) || 4)),
    );
  }

  @Get('products')
  @ApiOperation({
    summary:
      'Search products with filters (q, brand, category, size, color, price, discount, availability, campaign) and sorting',
  })
  listProducts(@Query(new ZodValidationPipe(productQuerySchema)) query: ProductQueryInput) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Product detail with variants and live availability' })
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Get('products/:slug/reviews')
  @ApiOperation({ summary: 'Published reviews with the rating distribution' })
  getProductReviews(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQueryInput,
  ) {
    return this.catalog.getProductReviews(slug, query);
  }

  @Get('products/:slug/related')
  @ApiOperation({ summary: 'Related products for a product page' })
  getRelatedProducts(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.catalog.relatedProducts(slug, Math.min(12, Math.max(1, Number(limit) || 4)));
  }
}
