import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '@outlet/config';
import { SessionService } from './session.service';
import { APP_CONFIG } from './tokens';
import { OPTIONAL_AUTH_KEY, PERMISSIONS_KEY } from './decorators';
import type { AuthedRequest } from './request-user';

/**
 * Session guard applied per-controller. Behavior:
 * - Resolves the session cookie into req.user when valid.
 * - With @OptionalAuth() the request continues without a user.
 * - With @RequirePermissions(...) the user must hold every listed permission
 *   (granular RBAC for the admin panel).
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookies = (request as { cookies?: Record<string, string> }).cookies ?? {};

    request.cartToken = cookies[this.config.auth.cartCookieName];
    const user = await this.sessions.resolveUser(cookies[this.config.auth.sessionCookieName]);
    if (user) request.user = user;

    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!user) {
      if (optional) return true;
      throw new UnauthorizedException('Authentication required');
    }

    if (required && required.length > 0) {
      const missing = required.filter((p) => !user.permissions.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
      }
    }
    return true;
  }
}
