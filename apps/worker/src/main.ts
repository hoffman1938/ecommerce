/**
 * Background worker (separate process from the API).
 *
 * Responsibilities:
 * - Reservation expiration: per-reservation delayed jobs + a safety-net sweep
 * - Email sending (all customer emails flow through the queue)
 * - Delayed mock payment completion (TEST-DELAYED)
 * - Campaign activation/expiration by date
 * - Inventory/cart cleanup
 *
 * Queues are consumed through the @outlet/queue abstraction, so BullMQ can be
 * replaced by Cloudflare Queues/Workflows without touching job logic.
 */
import { PrismaClient } from '@outlet/database';
import { loadConfig } from '@outlet/config';
import { createEmailProvider } from '@outlet/email';
import { MockPaymentProvider } from '@outlet/payments';
import { expectedCampaignStatus } from '@outlet/domain';
import {
  createQueueWorker,
  QUEUE_NAMES,
  JOB_NAMES,
  type EmailJobPayload,
  type QueueWorkerHandle,
} from '@outlet/queue';
import { expireReservationIfDue, sweepExpiredReservations } from './reservation-expiry';
import { processEmailJob } from './email-jobs';

const config = loadConfig();
const prisma = new PrismaClient();
const emailProvider = createEmailProvider(config.email.provider, {
  host: config.email.smtpHost,
  port: config.email.smtpPort,
  secure: config.email.smtpSecure,
  user: config.email.smtpUser || undefined,
  password: config.email.smtpPassword || undefined,
  from: config.email.from,
});
const mockProvider = new MockPaymentProvider({
  webhookSecret: config.payments.mockWebhookSecret,
  paymentPageBaseUrl: config.urls.storefront,
});

async function recordJob(
  queue: string,
  jobId: string,
  name: string,
  status: 'COMPLETED' | 'FAILED',
  error?: string,
): Promise<void> {
  try {
    await prisma.backgroundJobRecord.upsert({
      where: { queue_jobId: { queue, jobId } },
      create: {
        queue,
        jobId,
        name,
        status,
        attempts: 1,
        lastError: error,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      update: {
        status,
        attempts: { increment: 1 },
        lastError: error ?? null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });
  } catch {
    // Observability only — never fail a job over bookkeeping.
  }
}

// --- Queue consumers --------------------------------------------------------

const handles: QueueWorkerHandle[] = [];

handles.push(
  createQueueWorker(config.redisUrl, QUEUE_NAMES.reservations, async (job) => {
    if (job.name === JOB_NAMES.expireReservation) {
      const { reservationId } = job.data as { reservationId: string };
      const released = await expireReservationIfDue(prisma, reservationId);
      await recordJob(QUEUE_NAMES.reservations, job.id ?? reservationId, job.name, 'COMPLETED');
      if (released) console.log(`[reservations] expired ${reservationId}`);
    }
  }),
);

handles.push(
  createQueueWorker(config.redisUrl, QUEUE_NAMES.emails, async (job) => {
    if (job.name === JOB_NAMES.sendEmail) {
      const payload = job.data as EmailJobPayload;
      try {
        await processEmailJob(emailProvider, config, payload);
        await recordJob(QUEUE_NAMES.emails, job.id ?? '', job.name, 'COMPLETED');
        console.log(`[emails] sent ${payload.kind} to ${payload.to}`);
      } catch (err) {
        await recordJob(
          QUEUE_NAMES.emails,
          job.id ?? '',
          job.name,
          'FAILED',
          (err as Error).message,
        );
        throw err; // let BullMQ retry with backoff
      }
    }
  }),
);

handles.push(
  createQueueWorker(config.redisUrl, QUEUE_NAMES.payments, async (job) => {
    if (job.name === JOB_NAMES.processDelayedPayment) {
      const { paymentId } = job.data as { paymentId: string };
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return;
      // Deliver the delayed success through the API's normal webhook path so
      // verification, dedupe, and state transitions are fully exercised.
      const event = mockProvider.buildWebhookEvent({
        outcome: 'TEST-SUCCESS',
        paymentId,
        amountMinor: payment.amountMinor,
        currencyCode: payment.currencyCode,
        eventId: `mockevt_${paymentId}_delayed-success`,
      });
      const raw = JSON.stringify(event);
      const response = await fetch(`${config.urls.api}/payments/webhook/mock`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mock-signature': mockProvider.signPayload(raw),
        },
        body: raw,
      });
      if (!response.ok) {
        throw new Error(`Delayed payment webhook delivery failed: HTTP ${response.status}`);
      }
      await recordJob(QUEUE_NAMES.payments, job.id ?? paymentId, job.name, 'COMPLETED');
      console.log(`[payments] delayed payment completed for ${paymentId}`);
    }
  }),
);

// --- Scheduled sweeps -------------------------------------------------------

async function reservationSweep(): Promise<void> {
  try {
    const released = await sweepExpiredReservations(prisma);
    if (released > 0) console.log(`[sweep] released ${released} expired reservations`);
  } catch (err) {
    console.error('[sweep] reservation sweep failed:', (err as Error).message);
  }
}

async function campaignSweep(): Promise<void> {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ['SCHEDULED', 'ACTIVE', 'ENDED'] } },
    });
    for (const campaign of campaigns) {
      const expected = expectedCampaignStatus(campaign);
      if (expected !== campaign.status && expected !== 'ENDED' && campaign.status !== 'ENDED') {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: expected } });
        console.log(`[campaigns] ${campaign.slug}: ${campaign.status} -> ${expected}`);
      } else if (expected === 'ENDED' && campaign.status !== 'ENDED') {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'ENDED' } });
        await prisma.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            action: 'campaign.auto_ended',
            entityType: 'Campaign',
            entityId: campaign.id,
          },
        });
        console.log(`[campaigns] ${campaign.slug}: ${campaign.status} -> ENDED`);
      }
    }
  } catch (err) {
    console.error('[sweep] campaign sweep failed:', (err as Error).message);
  }
}

async function cleanupSweep(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.cart.updateMany({
      where: { status: 'ACTIVE', updatedAt: { lt: thirtyDaysAgo }, items: { none: {} } },
      data: { status: 'ABANDONED' },
    });
    await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: thirtyDaysAgo } },
    });
  } catch (err) {
    console.error('[sweep] cleanup failed:', (err as Error).message);
  }
}

const timers = [
  setInterval(reservationSweep, config.worker.reservationSweepIntervalSeconds * 1000),
  setInterval(campaignSweep, config.worker.campaignSweepIntervalSeconds * 1000),
  setInterval(cleanupSweep, 60 * 60 * 1000),
];

// Run the sweeps once at startup so a restarted worker catches up instantly.
void reservationSweep();
void campaignSweep();

console.log(
  `Worker running (reservation sweep every ${config.worker.reservationSweepIntervalSeconds}s, campaign sweep every ${config.worker.campaignSweepIntervalSeconds}s)`,
);

async function shutdown(): Promise<void> {
  console.log('Worker shutting down...');
  timers.forEach((t) => clearInterval(t));
  await Promise.all(handles.map((h) => h.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
