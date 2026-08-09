'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDto } from '@outlet/types';
import { Alert, Badge, Button, SelectField, cx, formatMoney } from '@outlet/ui';
import { api, ApiError } from '@/lib/api';
import type { EventDto } from '@/lib/demo/inbox';
import type { InventoryRowDto, ReturnRowDto, SimulationStatusDto } from '@/lib/demo/simulation';
import { RETURN_STATUS_LABELS } from '@/lib/demo/simulation';
import { SCENARIOS } from '@/lib/scenarios';

/**
 * Simulation control center.
 *
 * Deliberately plain: this is an operator tool, not a storefront page, and
 * dressing it up would make it easy to mistake for one. Every control mutates
 * browser-local state only — there is no server behind any of it.
 */

const STAGES = ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;

const TIME_JUMPS = [
  { code: '1h', label: '+1 hour' },
  { code: '1d', label: '+1 day' },
  { code: '3d', label: '+3 days' },
  { code: '7d', label: '+7 days' },
] as const;

const RESET_TARGETS = [
  { code: 'orders', label: 'Orders, payments & returns' },
  { code: 'inventory', label: 'Inventory (restore all stock)' },
  { code: 'inbox', label: 'Notifications & emails' },
  { code: 'events', label: 'Event log' },
  { code: 'cart', label: 'Cart' },
  { code: 'wishlist', label: 'Wishlist' },
  { code: 'all', label: 'Everything (full reset)' },
] as const;

export function QaConsole() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const status = useQuery({
    queryKey: ['sim-status'],
    queryFn: () => api.get<SimulationStatusDto>('/simulation/status'),
    refetchInterval: 5000,
  });

  const orders = useQuery({
    queryKey: ['sim-orders'],
    queryFn: () => api.get<OrderDto[]>('/account/orders').catch(() => [] as OrderDto[]),
    refetchInterval: 5000,
  });

  const events = useQuery({
    queryKey: ['sim-events'],
    queryFn: () => api.get<EventDto[]>('/simulation/events?limit=40'),
    refetchInterval: 5000,
  });

  const inventory = useQuery({
    queryKey: ['sim-inventory'],
    queryFn: () => api.get<InventoryRowDto[]>('/simulation/inventory'),
  });

  const returns = useQuery({
    queryKey: ['sim-returns'],
    queryFn: () => api.get<ReturnRowDto[]>('/simulation/returns'),
    refetchInterval: 5000,
  });

  /** Every control routes through here so results and errors look the same. */
  const run = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) =>
      api.post(path, body ?? {}),
    onSuccess: (_data, variables) => {
      setMessage({ tone: 'success', text: `Done: ${variables.path.replace('/simulation/', '')}` });
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Something went wrong.',
      });
    },
  });

  const offsetLabel = describeOffset(status.data?.clockOffsetMs ?? 0);

  return (
    <div className="container-page py-8 lg:py-12">
      <header className="border-b border-ink-200 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xs bg-warning-100 px-2 py-1 text-2xs font-bold uppercase tracking-[0.08em] text-warning-700">
            Sandbox
          </span>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">
            Simulation control center
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          Drive the simulated store into any state without waiting. Everything here changes
          browser-local data only — no request leaves this page, no money moves, and nothing is sent
          to anyone.
        </p>
      </header>

      {message ? (
        <div className="mt-5">
          <Alert tone={message.tone === 'success' ? 'success' : 'error'}>{message.text}</Alert>
        </div>
      ) : null}

      {/* --- Clock ---------------------------------------------------------- */}
      <Panel
        title="Time"
        description="Advancing the clock ages reservations, campaign windows and fulfilment together."
      >
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Simulated now" value={formatStamp(status.data?.simulatedNow)} />
          <Stat label="Real now" value={formatStamp(status.data?.realNow)} />
          <Stat label="Offset" value={offsetLabel} />
        </dl>
        <div className="flex flex-wrap gap-2">
          {TIME_JUMPS.map((jump) => (
            <Button
              key={jump.code}
              variant="secondary"
              size="sm"
              onClick={() =>
                run.mutate({ path: '/simulation/travel', body: { amount: jump.code } })
              }
            >
              {jump.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => run.mutate({ path: '/simulation/reset-time' })}
          >
            Reset to real time
          </Button>
        </div>
      </Panel>

      {/* --- Scenarios ------------------------------------------------------ */}
      <Panel
        title="Scenarios"
        description="Step-by-step routes through the flows that are awkward to reach by hand."
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {SCENARIOS.map((scenario) => (
            <li key={scenario.id} className="rounded border border-ink-200 p-4">
              <h3 className="text-sm font-semibold text-ink-950">{scenario.title}</h3>
              <p className="mt-1 text-sm text-ink-600">{scenario.goal}</p>
              <ol className="mt-3 space-y-1 text-xs text-ink-600">
                {scenario.steps.map((step, index) => (
                  <li key={index} className="flex gap-2">
                    <span data-numeric className="shrink-0 font-semibold text-ink-400">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {scenario.startHref ? (
                <Link
                  href={scenario.startHref}
                  className="mt-3 inline-block text-xs font-medium text-ink-900 underline underline-offset-2 hover:text-ink-950"
                >
                  Start scenario →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      {/* --- Orders --------------------------------------------------------- */}
      <Panel
        title="Orders"
        description="Force fulfilment transitions, fail a delivery, or cancel. Sign in to see orders placed while signed in."
      >
        {(orders.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">
            No orders yet.{' '}
            <Link href="/products" className="underline underline-offset-2">
              Place one
            </Link>{' '}
            to use these controls.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(orders.data ?? []).map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink-950">
                    <Link
                      href={`/account/orders/view?id=${order.id}`}
                      className="underline underline-offset-2"
                    >
                      {order.orderNumber}
                    </Link>
                    <Badge tone={order.status === 'CANCELLED' ? 'red' : 'blue'}>
                      {order.status}
                    </Badge>
                  </p>
                  <p data-numeric className="text-xs text-ink-500">
                    {formatMoney(order.totalMinor, order.currencyCode)} · {order.items.length}{' '}
                    {order.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SelectField
                    id={`stage-${order.id}`}
                    aria-label={`Set stage for ${order.orderNumber}`}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      run.mutate({
                        path: '/simulation/set-order-stage',
                        body: { order: order.orderNumber, stage: e.target.value },
                      });
                    }}
                    className="w-40"
                  >
                    <option value="">Jump to stage…</option>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      run.mutate({
                        path: '/simulation/advance-order',
                        body: { order: order.orderNumber },
                      })
                    }
                  >
                    Advance
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      run.mutate({
                        path: '/simulation/fail-delivery',
                        body: { order: order.orderNumber },
                      })
                    }
                  >
                    Fail delivery
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run.mutate({
                        path: '/simulation/cancel-order',
                        body: { order: order.orderNumber },
                      })
                    }
                  >
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --- Returns -------------------------------------------------------- */}
      <Panel
        title="Returns & refunds"
        description="Walk a return through review, approval, receipt and refund. The refund and restock only happen at the final step."
      >
        {(returns.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">
            No returns yet. Deliver an order, then request one from its order page.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(returns.data ?? []).map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink-950">
                    {request.rmaNumber}
                    <Badge tone={request.status === 'REJECTED' ? 'red' : 'blue'}>
                      {RETURN_STATUS_LABELS[request.status] ?? request.status}
                    </Badge>
                  </p>
                  <p data-numeric className="text-xs text-ink-500">
                    {request.orderNumber} · {request.itemCount}{' '}
                    {request.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {formatMoney(request.refundMinor, 'EUR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={request.status === 'COMPLETED' || request.status === 'REJECTED'}
                    onClick={() =>
                      run.mutate({
                        path: '/simulation/advance-return',
                        body: { rma: request.rmaNumber },
                      })
                    }
                  >
                    Advance
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={request.status === 'COMPLETED' || request.status === 'REJECTED'}
                    onClick={() =>
                      run.mutate({
                        path: '/simulation/reject-return',
                        body: { rma: request.rmaNumber },
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --- Inventory ------------------------------------------------------ */}
      <Panel
        title="Inventory"
        description="Set a variant's availability to reproduce low-stock and sold-out states."
      >
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-25">
              <tr className="border-b border-ink-200 text-left">
                <th className="py-2 pr-3 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Variant
                </th>
                <th className="py-2 pr-3 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Available
                </th>
                <th className="py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Set
                </th>
              </tr>
            </thead>
            <tbody>
              {(inventory.data ?? []).map((row) => (
                <tr key={row.variantId} className="border-b border-ink-100">
                  <td className="py-2 pr-3">
                    <span className="block text-ink-900">{row.productName}</span>
                    <code data-numeric className="text-xs text-ink-500">
                      {row.sku}
                    </code>
                  </td>
                  <td data-numeric className="py-2 pr-3 text-ink-700">
                    {row.available} / {row.seeded}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      {[0, 1, 3].map((value) => (
                        <Button
                          key={value}
                          size="sm"
                          variant="secondary"
                          disabled={value > row.seeded}
                          onClick={() =>
                            run.mutate({
                              path: '/simulation/inventory',
                              body: { variantId: row.variantId, available: value },
                            })
                          }
                        >
                          {value}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run.mutate({
                            path: '/simulation/inventory',
                            body: { variantId: row.variantId, available: row.seeded },
                          })
                        }
                      >
                        Restore
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* --- Event log ------------------------------------------------------ */}
      <Panel
        title="Event log"
        description="Every state change the sandbox has recorded, newest first."
      >
        {(events.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">Nothing recorded yet.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
            {(events.data ?? []).map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <code className="text-xs font-semibold text-ink-900">{event.type}</code>
                <span className="text-xs text-ink-600">
                  {event.entityType} {event.entityId}
                </span>
                {event.previousState || event.newState ? (
                  <span className="text-xs text-ink-500">
                    {event.previousState ?? '—'} → {event.newState ?? '—'}
                  </span>
                ) : null}
                <span data-numeric className="ml-auto text-xs text-ink-400">
                  {formatStamp(event.at)} · {event.actor}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* --- Reset ---------------------------------------------------------- */}
      <Panel
        title="Reset test data"
        description="Clearing orders also returns the stock they consumed."
      >
        <div className="flex flex-wrap gap-2">
          {RESET_TARGETS.map((target) => (
            <Button
              key={target.code}
              variant={target.code === 'all' ? 'danger' : 'secondary'}
              size="sm"
              onClick={() => {
                run.mutate({ path: '/simulation/reset', body: { target: target.code } });
                if (target.code === 'all' || target.code === 'cart') {
                  // A full reset drops the localStorage record the whole app
                  // reads from, so a reload is the only clean way back.
                  setTimeout(() => window.location.reload(), 250);
                }
              }}
            >
              {target.label}
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 border-t border-ink-200 pt-6">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-ink-950">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink-200 px-3 py-2">
      <dt className="text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">{label}</dt>
      <dd data-numeric className={cx('mt-0.5 text-sm text-ink-900')}>
        {value}
      </dd>
    </div>
  );
}

function formatStamp(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function describeOffset(ms: number): string {
  if (ms === 0) return 'none';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `+${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder === 0 ? `+${days}d` : `+${days}d ${remainder}h`;
}
