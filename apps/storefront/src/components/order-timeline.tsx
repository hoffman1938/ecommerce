'use client';

import type { OrderDto, ShipmentDto } from '@outlet/types';
import { cx } from '@outlet/ui';
import { T } from '@/components/t';

/**
 * Order progress and carrier tracking.
 *
 * Two timelines rather than one: the order's own state machine (paid → packed →
 * shipped → delivered) and the parcel's scan history. Merging them reads as one
 * confused list, because "Packed" is something the warehouse did and "Out for
 * delivery" is something the carrier did.
 *
 * Stages the order has not reached yet are still shown, greyed — a customer
 * wants to know what is coming, not just what has happened.
 */

const ORDER_STAGES = [
  { status: 'PAID', label: 'Payment confirmed' },
  { status: 'PROCESSING', label: 'Processing' },
  { status: 'PACKED', label: 'Packed' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'DELIVERED', label: 'Delivered' },
] as const;

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderTimeline({ order }: { order: OrderDto }) {
  // Cancelled orders never complete the ladder, so showing the remaining
  // stages as "still to come" would be a lie.
  if (order.status === 'CANCELLED') {
    return (
      <section className="rounded border border-line bg-ink-25 p-4 dark:bg-surface-card sm:p-5">
        <h2 className="mb-3 font-semibold text-ink-950"><T id="ui.orderProgress" /></h2>
        <ol className="space-y-3">
          {order.timeline.map((entry, index) => (
            <li key={`${entry.status}-${index}`} className="flex gap-3 text-sm">
              <span
                className={cx(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  entry.status === 'CANCELLED' ? 'bg-sale-500' : 'bg-ink-400',
                )}
              />
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{entry.status.replace(/_/g, ' ')}</p>
                <p data-numeric className="text-xs text-ink-500">
                  {formatStamp(entry.at)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const reachedAt = new Map(order.timeline.map((entry) => [entry.status, entry.at]));
  const shipment = order.shipments[0];

  return (
    <section className="rounded border border-line bg-ink-25 p-4 dark:bg-surface-card sm:p-5">
      <h2 className="mb-4 font-semibold text-ink-950"><T id="ui.orderProgress" /></h2>

      <ol className="relative space-y-4 border-l border-line pl-5">
        {ORDER_STAGES.map((stage) => {
          const at = reachedAt.get(stage.status);
          const done = Boolean(at);
          return (
            <li key={stage.status} className="relative">
              <span
                className={cx(
                  'absolute -left-[1.4375rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-ink-25',
                  done ? 'bg-ink-950' : 'bg-ink-200',
                )}
                aria-hidden="true"
              />
              <p className={cx('text-sm font-medium', done ? 'text-ink-950' : 'text-ink-400')}>
                {stage.label}
              </p>
              {at ? (
                <p data-numeric className="text-xs text-ink-500">
                  {formatStamp(at)}
                </p>
              ) : (
                <p className="text-xs text-ink-400"><T id="ui.notYet" /></p>
              )}
            </li>
          );
        })}
      </ol>

      {shipment ? <TrackingTimeline shipment={shipment} /> : null}
    </section>
  );
}

function TrackingTimeline({ shipment }: { shipment: ShipmentDto }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-950">Tracking</h3>
        <p data-numeric className="text-xs text-ink-500">
          {shipment.carrier ?? 'Carrier'} · {shipment.trackingNumber ?? 'pending'}
        </p>
      </div>

      {shipment.events.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500"><T id="ui.noCarrierScansYetFirst" /></p>
      ) : (
        <ol className="relative mt-4 space-y-3.5 border-l border-line pl-5">
          {/* Newest first: the current whereabouts is what people open this for. */}
          {[...shipment.events].reverse().map((event, index) => (
            <li key={`${event.code}-${event.at}`} className="relative">
              <span
                className={cx(
                  'absolute -left-[1.4375rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-ink-25',
                  index === 0 ? 'bg-ink-950' : 'bg-ink-300',
                )}
                aria-hidden="true"
              />
              <p
                className={cx('text-sm', index === 0 ? 'font-medium text-ink-950' : 'text-ink-700')}
              >
                {event.label}
              </p>
              <p data-numeric className="text-xs text-ink-500">
                {formatStamp(event.at)}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
