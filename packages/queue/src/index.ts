import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Thin queue abstraction so BullMQ can later be swapped for Cloudflare
 * Queues / Workflows or another managed provider without touching business
 * code. Producers depend only on QueueClient; consumers only on
 * createQueueWorker.
 */

export const QUEUE_NAMES = {
  reservations: 'reservations',
  emails: 'emails',
  payments: 'payments',
  campaigns: 'campaigns',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  expireReservations: 'expire-reservations',
  expireReservation: 'expire-reservation',
  sendEmail: 'send-email',
  processDelayedPayment: 'process-delayed-payment',
  syncCampaignStatuses: 'sync-campaign-statuses',
  cleanupCarts: 'cleanup-carts',
} as const;

export interface EmailJobPayload {
  kind:
    | 'verification'
    | 'password-reset'
    | 'order-confirmation'
    | 'payment-failed'
    | 'shipment'
    | 'return-status'
    | 'refund-confirmation';
  to: string;
  data: Record<string, unknown>;
}

export interface EnqueueOptions {
  /** Delay in milliseconds before the job becomes available. */
  delayMs?: number;
  /** Stable id — enqueueing the same id twice is a no-op (idempotency). */
  jobId?: string;
  attempts?: number;
}

export interface QueueClient {
  enqueue(queue: QueueName, jobName: string, payload: unknown, opts?: EnqueueOptions): Promise<void>;
  close(): Promise<void>;
}

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export class BullMqQueueClient implements QueueClient {
  private readonly queues = new Map<string, Queue>();
  private readonly connection: IORedis;

  constructor(redisUrl: string) {
    this.connection = createRedisConnection(redisUrl);
  }

  private getQueue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue(
    queue: QueueName,
    jobName: string,
    payload: unknown,
    opts: EnqueueOptions = {},
  ): Promise<void> {
    const jobOptions: JobsOptions = {
      delay: opts.delayMs,
      jobId: opts.jobId,
      attempts: opts.attempts ?? 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    };
    await this.getQueue(queue).add(jobName, payload, jobOptions);
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}

export interface QueueWorkerHandle {
  close(): Promise<void>;
}

/** Consumer-side wrapper; the worker app registers processors through this. */
export function createQueueWorker(
  redisUrl: string,
  queueName: QueueName,
  processor: Processor,
  concurrency = 5,
): QueueWorkerHandle {
  const worker = new Worker(queueName, processor, {
    connection: createRedisConnection(redisUrl),
    concurrency,
  });
  worker.on('failed', (job, err) => {
    console.error(`[${queueName}] job ${job?.name ?? 'unknown'} failed:`, err.message);
  });
  return {
    close: () => worker.close(),
  };
}

/** In-memory stub used by unit tests. */
export class InMemoryQueueClient implements QueueClient {
  public readonly jobs: Array<{ queue: QueueName; jobName: string; payload: unknown; opts?: EnqueueOptions }> = [];

  async enqueue(
    queue: QueueName,
    jobName: string,
    payload: unknown,
    opts?: EnqueueOptions,
  ): Promise<void> {
    this.jobs.push({ queue, jobName, payload, opts });
  }

  async close(): Promise<void> {
    // nothing to close
  }
}
