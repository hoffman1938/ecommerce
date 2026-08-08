/**
 * Demo authentication.
 *
 * Mirrors the real /auth surface so the storefront's sign-in, registration and
 * password screens all function, but the "session" is just a user id in
 * localStorage. See store.ts for why this is not, and must never be mistaken
 * for, authentication.
 *
 * Two flows differ deliberately from production because there is no mail
 * server: registration verifies the address immediately and signs the user in,
 * and password reset hands the token straight back to the caller instead of
 * emailing a link.
 */

import {
  DemoApiError,
  currentUser,
  hashPassword,
  mutate,
  newId,
  readState,
  type DemoUser,
} from './store';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  roles: string[];
  permissions: string[];
}

export function toSessionUser(user: DemoUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isEmailVerified: user.isEmailVerified,
    roles: ['CUSTOMER'],
    permissions: [],
  };
}

function normaliseEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new DemoApiError(400, 'Enter a valid email address.');
  }
  return email.trim().toLowerCase();
}

/** Same rules as packages/validation's passwordSchema. */
function assertPasswordStrength(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new DemoApiError(400, 'Password must be at least 8 characters.');
  }
  if (!/[a-z]/.test(password))
    throw new DemoApiError(400, 'Password must contain a lowercase letter.');
  if (!/[A-Z]/.test(password))
    throw new DemoApiError(400, 'Password must contain an uppercase letter.');
  if (!/[0-9]/.test(password)) throw new DemoApiError(400, 'Password must contain a digit.');
  return password;
}

export interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  newsletterOptIn?: boolean;
}

export function register(body: RegisterBody): { user: SessionUser } {
  const email = normaliseEmail(body?.email);
  const password = assertPasswordStrength(body?.password);
  const firstName = String(body?.firstName ?? '').trim();
  const lastName = String(body?.lastName ?? '').trim();
  if (!firstName || !lastName) {
    throw new DemoApiError(400, 'First and last name are required.');
  }

  return mutate((state) => {
    if (state.users.some((u) => u.email === email)) {
      throw new DemoApiError(409, 'An account with that email already exists.');
    }
    const user: DemoUser = {
      id: newId('user'),
      email,
      passwordHash: hashPassword(email, password),
      firstName,
      lastName,
      // No mail server in the demo, so skip the verification round-trip
      // rather than stranding the account behind a link that never arrives.
      isEmailVerified: true,
      newsletterOptIn: Boolean(body?.newsletterOptIn),
      notificationPreferences: {
        orderUpdates: true,
        campaignAnnouncements: Boolean(body?.newsletterOptIn),
        newsletter: Boolean(body?.newsletterOptIn),
      },
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    state.sessionUserId = user.id;
    if (user.newsletterOptIn && !state.newsletterEmails.includes(email)) {
      state.newsletterEmails.push(email);
    }
    return { user: toSessionUser(user) };
  });
}

export function login(body: { email: string; password: string }): { user: SessionUser } {
  const email = normaliseEmail(body?.email);
  const password = String(body?.password ?? '');

  return mutate((state) => {
    const user = state.users.find((u) => u.email === email);
    // Same message for unknown address and wrong password, as the real API does.
    if (!user || user.passwordHash !== hashPassword(email, password)) {
      throw new DemoApiError(401, 'Incorrect email or password.');
    }
    state.sessionUserId = user.id;
    return { user: toSessionUser(user) };
  });
}

export function logout(): Record<string, never> {
  return mutate((state) => {
    state.sessionUserId = null;
    return {};
  });
}

export function me(): { user: SessionUser | null } {
  const user = currentUser();
  return { user: user ? toSessionUser(user) : null };
}

export function changePassword(body: { currentPassword: string; newPassword: string }) {
  const next = assertPasswordStrength(body?.newPassword);
  return mutate((state) => {
    const user = state.users.find((u) => u.id === state.sessionUserId);
    if (!user) throw new DemoApiError(401, 'You need to be signed in to do that.');
    if (user.passwordHash !== hashPassword(user.email, String(body?.currentPassword ?? ''))) {
      throw new DemoApiError(400, 'Your current password is not correct.');
    }
    user.passwordHash = hashPassword(user.email, next);
    return { ok: true };
  });
}

/**
 * Returns the token and a ready-made link. The real API emails these and
 * responds with nothing, but a demo with no mail server would otherwise leave
 * the user at a dead end.
 */
export function forgotPassword(body: { email: string }) {
  const email = normaliseEmail(body?.email);
  return mutate((state) => {
    const user = state.users.find((u) => u.email === email);
    // Never reveal whether the address exists.
    if (!user) return { ok: true, token: null, resetUrl: null };
    const token = newId('reset').replace('reset_', 'reset-token-');
    state.resetTokens[token] = user.id;
    return {
      ok: true,
      token,
      resetUrl: `/reset-password?token=${encodeURIComponent(token)}`,
    };
  });
}

export function resetPassword(body: { token: string; password: string }) {
  const password = assertPasswordStrength(body?.password);
  const token = String(body?.token ?? '');
  return mutate((state) => {
    const userId = state.resetTokens[token];
    if (!userId)
      throw new DemoApiError(400, 'That reset link is invalid or has already been used.');
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw new DemoApiError(400, 'That reset link is no longer valid.');
    user.passwordHash = hashPassword(user.email, password);
    delete state.resetTokens[token];
    return { ok: true };
  });
}

export function verifyEmail(body: { token: string }) {
  const token = String(body?.token ?? '');
  return mutate((state) => {
    const userId = state.verifyTokens[token] ?? state.sessionUserId;
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw new DemoApiError(400, 'That verification link is invalid.');
    user.isEmailVerified = true;
    delete state.verifyTokens[token];
    return { ok: true };
  });
}

export function subscribeNewsletter(body: { email: string }) {
  const email = normaliseEmail(body?.email);
  return mutate((state) => {
    if (!state.newsletterEmails.includes(email)) state.newsletterEmails.push(email);
    return { ok: true };
  });
}

export function isSignedIn(): boolean {
  return Boolean(readState().sessionUserId);
}
