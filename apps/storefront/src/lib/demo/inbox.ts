/**
 * Notification centre, simulated mailbox and event log reads.
 *
 * Writes happen wherever the state change happens (see lifecycle.ts); this
 * module only exposes them. Everything is scoped to the signed-in user, with
 * guest-checkout records matched by email so someone who ordered without an
 * account still sees their own confirmations after registering.
 */

import {
  currentUser,
  mutate,
  readState,
  type DemoEmail,
  type DemoEvent,
  type DemoNotification,
  type DemoState,
} from './store';

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  orderNumber: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface EmailDto {
  id: string;
  to: string;
  subject: string;
  body: string;
  template: string;
  orderNumber: string | null;
  readAt: string | null;
  sentAt: string;
}

export interface EventDto {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  actor: string;
  previousState: string | null;
  newState: string | null;
  metadata: Record<string, unknown> | null;
  at: string;
}

/**
 * Records belonging to the current viewer. Guest records (userId null) are
 * matched by the email addresses this browser has ordered under, which is the
 * closest honest equivalent of a guest session.
 */
function visibleNotifications(state: DemoState): DemoNotification[] {
  const user = currentUser(state);
  const guestEmails = new Set(
    state.orders.filter((order) => order.userId === null).map((order) => order.email),
  );
  return state.notifications.filter((notification) => {
    if (user && notification.userId === user.id) return true;
    if (notification.userId !== null) return false;
    // Guest notification: show it if this browser placed that order.
    const order = state.orders.find((o) => o.orderNumber === notification.orderNumber);
    return order ? guestEmails.has(order.email) : true;
  });
}

function byNewest<T extends { createdAt?: string; sentAt?: string; at?: string }>(items: T[]): T[] {
  const stamp = (item: T) => item.createdAt ?? item.sentAt ?? item.at ?? '';
  return [...items].sort((a, b) => Date.parse(stamp(b)) - Date.parse(stamp(a)));
}

export function listNotifications(): { items: NotificationDto[]; unreadCount: number } {
  const state = readState();
  const items = byNewest(visibleNotifications(state));
  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderNumber: n.orderNumber,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unreadCount: items.filter((n) => n.readAt === null).length,
  };
}

export function markNotificationRead(id: string) {
  return mutate((state) => {
    const notification = state.notifications.find((n) => n.id === id);
    if (notification && !notification.readAt) {
      notification.readAt = new Date(Date.now() + state.clockOffsetMs).toISOString();
    }
    return { ok: true };
  });
}

export function markAllNotificationsRead() {
  return mutate((state) => {
    const at = new Date(Date.now() + state.clockOffsetMs).toISOString();
    for (const notification of visibleNotifications(state)) {
      if (!notification.readAt) notification.readAt = at;
    }
    return { ok: true };
  });
}

/** The tester's mailbox. Addresses this browser has actually used only. */
function visibleEmails(state: DemoState): DemoEmail[] {
  const user = currentUser(state);
  const addresses = new Set<string>(state.orders.map((order) => order.email));
  if (user) addresses.add(user.email);
  return state.emails.filter((email) => addresses.has(email.to));
}

export function listEmails(): { items: EmailDto[]; unreadCount: number } {
  const state = readState();
  const items = byNewest(visibleEmails(state));
  return {
    items: items.map((e) => ({
      id: e.id,
      to: e.to,
      subject: e.subject,
      body: e.body,
      template: e.template,
      orderNumber: e.orderNumber,
      readAt: e.readAt,
      sentAt: e.sentAt,
    })),
    unreadCount: items.filter((e) => e.readAt === null).length,
  };
}

export function markEmailRead(id: string) {
  return mutate((state) => {
    const email = state.emails.find((e) => e.id === id);
    if (email && !email.readAt) {
      email.readAt = new Date(Date.now() + state.clockOffsetMs).toISOString();
    }
    return { ok: true };
  });
}

/**
 * The audit trail. Unlike notifications and email this is not scoped to a
 * user — it is a QA tool, and the whole point is seeing everything the sandbox
 * did, including the parts that happened before you signed in.
 */
export function listEvents(limit = 100): EventDto[] {
  const state = readState();
  return byNewest(state.events as unknown as Array<DemoEvent & { at: string }>)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId,
      actor: e.actor,
      previousState: e.previousState,
      newState: e.newState,
      metadata: e.metadata,
      at: e.at,
    }));
}
