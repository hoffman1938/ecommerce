'use client';

import { useEffect, useState } from 'react';
import { cx, formatCountdown } from '@outlet/ui';

/**
 * Visual countdown to a server-provided expiration timestamp. The server is
 * authoritative — this component only renders the remaining time and never
 * extends or resets anything. Refreshing the page re-reads the same
 * `expiresAt`, so the timer visibly continues instead of restarting.
 *
 * Uses tabular numerals rather than a monospace face so the digits hold a
 * fixed width without switching typeface mid-sentence.
 */
export function Countdown({
  expiresAt,
  onExpired,
  className,
  tone = 'default',
}: {
  expiresAt: string;
  onExpired?: () => void;
  className?: string;
  /** `inverse` for use on dark artwork, where the urgency red would vanish. */
  tone?: 'default' | 'inverse';
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const urgent = secondsLeft <= 120;

  return (
    <span
      data-numeric
      className={cx(
        'font-semibold',
        tone === 'inverse'
          ? 'text-ink-25'
          : urgent
            ? 'text-sale-500'
            : 'text-ink-800',
        className,
      )}
      data-testid="reservation-countdown"
      title="Reserved until the timer runs out"
    >
      {formatCountdown(secondsLeft)}
    </span>
  );
}
