'use client';

import Link from 'next/link';
import { ApiError } from '@/lib/api';

/**
 * What a detail screen shows instead of its record.
 *
 * Every one of the five detail screens used to branch on `if (!record) return
 * <Loading/>`, which is right while the request is in flight and wrong the
 * moment it fails: the query settles with `data: undefined`, so a bad or missing
 * `?id=` left "Loading order…" on the screen permanently. A stale bookmark or a
 * mistyped URL became a spinner that would never resolve, with nothing to read
 * and nothing to click.
 *
 * The branch is on `error` rather than on a loading flag, deliberately. A query
 * that is retrying — or that TanStack has paused because it believes the browser
 * is offline — is still pending and still has no error, and telling the operator
 * their order does not exist because a retry is in flight would be worse than
 * the spinner. Only an error that actually arrived produces the error state.
 */
export function DetailState({
  error,
  loadingLabel,
  noun,
  backHref,
  backLabel,
}: {
  /** The query's error, or null/undefined while it is still trying. */
  error: unknown;
  /** e.g. "Loading order…" — the message already written for the waiting case. */
  loadingLabel: string;
  /** e.g. "order", for the sentence explaining what was not found. */
  noun: string;
  backHref: string;
  backLabel: string;
}) {
  if (!error) return <p className="text-gray-500">{loadingLabel}</p>;

  /*
   * `status` is read off the error rather than through `instanceof` alone, so a
   * rejection that arrived from anywhere else — a wrapped error, a second copy
   * of the module in a differently-bundled chunk — still produces the right
   * sentence instead of the generic one.
   */
  const status =
    error instanceof ApiError
      ? error.status
      : typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 0;

  const heading =
    status === 404
      ? `That ${noun} does not exist`
      : status === 401
        ? 'Your session has ended'
        : status === 403
          ? `You cannot view this ${noun}`
          : `That ${noun} could not be loaded`;

  const detail =
    status === 404
      ? 'It may have been deleted, or the link may be wrong.'
      : status === 401
        ? 'Sign in again to carry on.'
        : status === 403
          ? 'Your role does not include permission to see it. Ask an administrator if you need access.'
          : error instanceof Error && error.message
            ? error.message
            : 'Something went wrong fetching it. Please try again.';

  return (
    <div className="max-w-lg py-8">
      <h1 className="text-xl font-semibold">{heading}</h1>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
      <Link
        href={status === 401 ? '/login' : backHref}
        className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
      >
        {status === 401 ? 'Go to sign in' : backLabel}
      </Link>
    </div>
  );
}
