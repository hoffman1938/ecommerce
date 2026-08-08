import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { productQuerySchema, type ProductQueryInput } from '@outlet/validation';
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
  @ApiOperation({ summary: 'Category tree' })
  listCategories() {
    return this.catalog.listCategories();
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
}
