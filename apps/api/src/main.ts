import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { loadConfig } from '@outlet/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody is required for webhook signature verification.
    rawBody: true,
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  if (config.server.trustProxy) {
    app.set('trust proxy', 1);
  }

  // The API never assumes it shares a domain with the frontends.
  app.enableCors({
    origin: config.auth.trustedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const swagger = new DocumentBuilder()
    .setTitle('Outlet Marketplace API')
    .setDescription(
      'REST API for the local-first outlet marketplace. Authentication uses an HttpOnly session cookie set by /auth/login. Request bodies are validated with Zod schemas from @outlet/validation.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(config.auth.sessionCookieName)
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();
  await app.listen(config.server.port, config.server.host);
  console.log(
    `API listening on http://${config.server.host}:${config.server.port} (docs at /docs)`,
  );
}

bootstrap().catch((err) => {
  console.error('API failed to start:', err);
  process.exit(1);
});
