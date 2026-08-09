'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, EmptyState, cx } from '@outlet/ui';
import { api } from '@/lib/api';
import type { EmailDto, NotificationDto } from '@/lib/demo/inbox';

/**
 * Notification centre and simulated mailbox.
 *
 * The mailbox is the honest way to test email-driven flows in a sandbox: the
 * messages a real system would have sent are rendered here instead of being
 * delivered to anybody. Nothing is transmitted, and there is no SMTP transport
 * in this build at all.
 */

type Tab = 'notifications' | 'emails';

export function InboxView() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('notifications');
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<{ items: NotificationDto[]; unreadCount: number }>('/account/notifications'),
    refetchInterval: 15_000,
  });

  const emails = useQuery({
    queryKey: ['emails'],
    queryFn: () => api.get<{ items: EmailDto[]; unreadCount: number }>('/account/inbox'),
    refetchInterval: 15_000,
  });

  const refresh = () => queryClient.invalidateQueries();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">Notifications</h1>
        {tab === 'notifications' && (notifications.data?.unreadCount ?? 0) > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await api.post('/account/notifications/read-all', {});
              refresh();
            }}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      <Alert tone="info">
        This is a sandbox mailbox. Messages are generated locally and never sent to a real address.
      </Alert>

      <div role="tablist" className="flex gap-1 border-b border-ink-200">
        <TabButton
          active={tab === 'notifications'}
          onClick={() => setTab('notifications')}
          count={notifications.data?.unreadCount ?? 0}
        >
          In-app
        </TabButton>
        <TabButton
          active={tab === 'emails'}
          onClick={() => setTab('emails')}
          count={emails.data?.unreadCount ?? 0}
        >
          Email inbox
        </TabButton>
      </div>

      {tab === 'notifications' ? (
        (notifications.data?.items ?? []).length === 0 ? (
          <EmptyState
            title="No notifications yet"
            description="Order updates appear here as your order moves through fulfilment."
            action={
              <Link href="/products" className="text-sm underline underline-offset-2">
                Browse the outlet
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100 border-t border-ink-200">
            {(notifications.data?.items ?? []).map((notification) => (
              <li
                key={notification.id}
                className={cx('py-4', notification.readAt === null && 'bg-ink-25')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cx(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      notification.readAt === null ? 'bg-sale-500' : 'bg-ink-200',
                    )}
                    aria-label={notification.readAt === null ? 'Unread' : 'Read'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-950">{notification.title}</p>
                    <p className="mt-0.5 text-sm text-ink-600">{notification.body}</p>
                    <p data-numeric className="mt-1 text-xs text-ink-400">
                      {formatStamp(notification.createdAt)}
                    </p>
                  </div>
                  {notification.readAt === null ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.post(`/account/notifications/${notification.id}/read`, {});
                        refresh();
                      }}
                      className="shrink-0 text-xs text-ink-500 underline underline-offset-2 hover:text-ink-950"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (emails.data?.items ?? []).length === 0 ? (
        <EmptyState
          title="No emails yet"
          description="Order confirmations and shipping updates land here instead of a real inbox."
        />
      ) : (
        <ul className="divide-y divide-ink-100 border-t border-ink-200">
          {(emails.data?.items ?? []).map((email) => {
            const open = openEmailId === email.id;
            return (
              <li key={email.id} className={cx(email.readAt === null && 'bg-ink-25')}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={async () => {
                    setOpenEmailId(open ? null : email.id);
                    if (!open && email.readAt === null) {
                      await api.post(`/account/inbox/${email.id}/read`, {});
                      refresh();
                    }
                  }}
                  className="flex w-full items-start gap-3 py-4 text-left"
                >
                  <span
                    className={cx(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      email.readAt === null ? 'bg-sale-500' : 'bg-ink-200',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cx(
                          'text-sm text-ink-950',
                          email.readAt === null ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {email.subject}
                      </span>
                      {email.orderNumber ? <Badge tone="neutral">{email.orderNumber}</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      To {email.to} · {formatStamp(email.sentAt)}
                    </span>
                  </span>
                </button>

                {open ? (
                  <div className="border-l-2 border-ink-200 pb-4 pl-4">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                      {email.body}
                    </p>
                    {email.orderNumber ? (
                      <Link
                        href="/account/orders"
                        className="mt-3 inline-block text-sm underline underline-offset-2"
                      >
                        View order
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-ink-950 text-ink-950'
          : 'border-transparent text-ink-500 hover:text-ink-900',
      )}
    >
      {children}
      {count > 0 ? (
        <span
          data-numeric
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sale-500 px-1 text-[10px] font-semibold text-white"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
