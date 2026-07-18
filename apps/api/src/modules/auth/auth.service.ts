import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfig } from '@outlet/config';
import { generateToken, hashPassword, hashToken, verifyPassword } from '@outlet/auth';
import { QUEUE_NAMES, JOB_NAMES, type QueueClient, type EmailJobPayload } from '@outlet/queue';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@outlet/validation';
import { PrismaService } from '../../common/prisma.service';
import { SessionService } from '../../common/session.service';
import { AuditService } from '../../common/audit.service';
import { APP_CONFIG, QUEUE_CLIENT } from '../../common/tokens';
import { CartService } from '../cart/cart.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly carts: CartService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(QUEUE_CLIENT) private readonly queue: QueueClient,
  ) {}

  private async queueEmail(payload: EmailJobPayload): Promise<void> {
    await this.queue.enqueue(QUEUE_NAMES.emails, JOB_NAMES.sendEmail, payload);
  }

  async register(input: RegisterInput, ip?: string): Promise<{ userId: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Do not leak whether an email is registered; behave as success.
      return { userId: existing.id };
    }

    const passwordHash = await hashPassword(input.password);
    const verificationToken = generateToken();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        newsletterOptIn: input.newsletterOptIn ?? false,
        emailVerificationTokenHash: hashToken(verificationToken, this.config.auth.sessionSecret),
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600_000),
      },
    });

    if (input.newsletterOptIn) {
      await this.prisma.newsletterSubscription.upsert({
        where: { email: input.email },
        create: { email: input.email, source: 'registration' },
        update: { unsubscribedAt: null },
      });
    }

    const verifyUrl = `${this.config.urls.storefront}/verify-email?token=${verificationToken}`;
    await this.queueEmail({ kind: 'verification', to: user.email, data: { verifyUrl } });
    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'CUSTOMER',
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      ip,
    });
    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationTokenHash: tokenHash },
    });
    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException('Verification link is invalid or has expired.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
  }

  async login(
    input: LoginInput,
    meta: { ip?: string; userAgent?: string; anonymousCartToken?: string },
  ): Promise<{ token: string; expiresAt: Date; user: { id: string; email: string } }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const genericError = new UnauthorizedException('Invalid email or password.');
    if (!user) throw genericError;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Account temporarily locked after repeated failed logins. Try again later.',
      );
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('This account has been disabled.');
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);
    if (!passwordOk) {
      const failed = user.failedLoginAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failed,
          lockedUntil:
            failed >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : null,
        },
      });
      throw genericError;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const session = await this.sessions.createSession(user.id, meta);

    // Merge any anonymous cart into the user cart. Reservation timers are
    // intentionally NOT reset by login (spec requirement).
    if (meta.anonymousCartToken) {
      await this.carts.mergeAnonymousCartIntoUser(meta.anonymousCartToken, user.id);
    }

    await this.audit.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorType: 'CUSTOMER',
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ip: meta.ip,
    });
    return { token: session.token, expiresAt: session.expiresAt, user: { id: user.id, email: user.email } };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revokeSession(sessionId);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always succeed to avoid account enumeration.
    if (!user) return;

    const resetToken = generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashToken(resetToken, this.config.auth.sessionSecret),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });
    const resetUrl = `${this.config.urls.storefront}/reset-password?token=${resetToken}`;
    await this.queueEmail({ kind: 'password-reset', to: user.email, data: { resetUrl } });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = hashToken(input.token, this.config.auth.sessionSecret);
    const user = await this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash },
    });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    // Security: a password reset revokes every existing session.
    await this.sessions.revokeAllSessions(user.id);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.sessions.revokeAllSessions(userId, keepSessionId);
  }
}
