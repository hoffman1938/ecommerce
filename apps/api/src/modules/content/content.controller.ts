import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { newsletterSubscribeSchema, type NewsletterSubscribeInput } from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('content/pages/:key')
  @ApiOperation({ summary: 'Public content page (privacy, terms, faq, ...)' })
  async getPage(@Param('key') key: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { key } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  @Post('newsletter/subscribe')
  @HttpCode(201)
  @ApiOperation({ summary: 'Subscribe to the newsletter' })
  async subscribe(
    @Body(new ZodValidationPipe(newsletterSubscribeSchema)) body: NewsletterSubscribeInput,
  ) {
    await this.prisma.newsletterSubscription.upsert({
      where: { email: body.email },
      create: { email: body.email, source: 'footer' },
      update: { unsubscribedAt: null },
    });
    return { message: 'Subscribed.' };
  }
}
