import { Injectable } from '@nestjs/common';
import type { Prisma } from '@outlet/database';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorType: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget audit logging; failures must never break the request. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          actorEmail: entry.actorEmail ?? null,
          actorType: entry.actorType,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
          after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
          reason: entry.reason ?? null,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      console.error('Audit log write failed:', (err as Error).message);
    }
  }
}
