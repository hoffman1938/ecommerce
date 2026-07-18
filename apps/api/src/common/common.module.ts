import { Global, Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@outlet/config';
import { createPaymentProvider } from '@outlet/payments';
import { createStorageProvider } from '@outlet/storage';
import { createEmailProvider } from '@outlet/email';
import { BullMqQueueClient, InMemoryQueueClient, type QueueClient } from '@outlet/queue';
import { createCaptchaProvider } from '@outlet/auth';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { SettingsService } from './settings.service';
import {
  APP_CONFIG,
  CAPTCHA_PROVIDER,
  EMAIL_PROVIDER,
  PAYMENT_PROVIDER,
  QUEUE_CLIENT,
  STORAGE_PROVIDER,
} from './tokens';

/**
 * Global infrastructure module. All external services are provided through
 * interfaces selected by environment configuration, keeping the domain and
 * HTTP layers portable (local Docker today, Cloudflare-adjacent later).
 */
@Global()
@Module({
  providers: [
    PrismaService,
    AuditService,
    SettingsService,
    { provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: AppConfig) =>
        createPaymentProvider({
          provider: config.payments.provider,
          mockWebhookSecret: config.payments.mockWebhookSecret,
          storefrontUrl: config.urls.storefront,
          stripeSecretKey: config.payments.stripeSecretKey,
          stripeWebhookSecret: config.payments.stripeWebhookSecret,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: AppConfig) =>
        createStorageProvider(config.storage.provider, {
          endpoint: config.storage.endpoint,
          publicEndpoint: config.storage.publicEndpoint,
          region: config.storage.region,
          bucket: config.storage.bucket,
          accessKey: config.storage.accessKey,
          secretKey: config.storage.secretKey,
          forcePathStyle: config.storage.forcePathStyle,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: AppConfig) =>
        createEmailProvider(config.email.provider, {
          host: config.email.smtpHost,
          port: config.email.smtpPort,
          secure: config.email.smtpSecure,
          user: config.email.smtpUser || undefined,
          password: config.email.smtpPassword || undefined,
          from: config.email.from,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: QUEUE_CLIENT,
      useFactory: (config: AppConfig): QueueClient =>
        config.isTest ? new InMemoryQueueClient() : new BullMqQueueClient(config.redisUrl),
      inject: [APP_CONFIG],
    },
    {
      provide: CAPTCHA_PROVIDER,
      useFactory: (config: AppConfig) =>
        createCaptchaProvider(config.auth.captchaProvider, config.auth.turnstileSecretKey),
      inject: [APP_CONFIG],
    },
  ],
  exports: [
    PrismaService,
    AuditService,
    SettingsService,
    APP_CONFIG,
    PAYMENT_PROVIDER,
    STORAGE_PROVIDER,
    EMAIL_PROVIDER,
    QUEUE_CLIENT,
    CAPTCHA_PROVIDER,
  ],
})
export class CommonModule {}
