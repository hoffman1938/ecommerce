import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest, RequestUser } from './request-user';

export const PERMISSIONS_KEY = 'required_permissions';
export const OPTIONAL_AUTH_KEY = 'optional_auth';

/** Require one or more RBAC permissions (admin endpoints). */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Attach the user when a valid session exists but do not require one. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const CurrentUser = createParamDecorator(
  (data: { required?: boolean } | undefined, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user && data?.required !== false) {
      throw new UnauthorizedException('Authentication required');
    }
    return request.user;
  },
);
