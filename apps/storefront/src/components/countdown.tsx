'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '@outlet/ui';

/**
 * Visual countdown to a server-provided expiration timestamp. The server is
 * authoritative — this component only renders the remaining time and never
 * extends or resets anything. Refreshing the page re-reads the same
 * `expiresAt`, so the timer visibly continues instead of restarting.
 */
export function Countdown({
  expiresAt,
  onExpired,
  className,
}: {
  expiresAt: string;
  onExpired?: () => void;
  className?: string;
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
      className={`font-mono text-sm font-semibold ${urgent ? 'text-red-600' : 'text-gray-700'} ${className ?? ''}`}
      data-testid="reservation-countdown"
      title="Reserved until the timer runs out"
    >
      {formatCountdown(secondsLeft)}
    </span>
  );
}
