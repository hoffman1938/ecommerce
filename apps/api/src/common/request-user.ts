import type { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  roles: string[];
  permissions: Set<string>;
  sessionId: string;
}

export interface AuthedRequest extends Request {
  user?: RequestUser;
  /** Anonymous cart token from the cart cookie (may coexist with user). */
  cartToken?: string;
}
