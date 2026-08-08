import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { AppConfig } from '@outlet/config';
import { generateToken, hashToken } from '@outlet/auth';
import { PrismaService } from './prisma.service';
import { APP_CONFIG } from './tokens';
import type { RequestUser } from './request-user';

const SESSION_TTL_DAYS = 30;

/**
 * Cookie-based opaque session tokens. Only the HMAC of a token is stored, so
 * leaked database rows cannot be replayed as sessions. Cookie behavior
 * (domain, Secure, SameSite) is fully environment-driven for portability
 * across localhost and future cross-domain Cloudflare deployments.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createSession(
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const token = generateToken();
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });
    return { token, sessionId: session.id, expiresAt };
  }

  async resolveUser(token: string | undefined): Promise<RequestUser | null> {
    if (!token) return null;
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    if (session.user.status !== 'ACTIVE') return null;

    // Touch lastUsedAt at most once a minute to avoid write amplification.
    if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
      this.prisma.userSession
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }

    const roles = session.user.roles.map((ur) => ur.role.name);
    const permissions = new Set<string>();
    for (const userRole of session.user.roles) {
      for (const rp of userRole.role.permissions) {
        permissions.add(rp.permission.key);
      }
    }
    return {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      isEmailVerified: session.user.isEmailVerified,
      roles,
      permissions,
      sessionId: session.id,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(this.config.auth.sessionCookieName, token, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      domain: this.config.auth.cookieDomain,
      expires: expiresAt,
      path: '/',
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(this.config.auth.sessionCookieName, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      domain: this.config.auth.cookieDomain,
      path: '/',
    });
  }

  setCartCookie(res: Response, cartToken: string): void {
    res.cookie(this.config.auth.cartCookieName, cartToken, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      domain: this.config.auth.cookieDomain,
      // Persistent cart across browser restarts (spec requirement).
      maxAge: 90 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}
