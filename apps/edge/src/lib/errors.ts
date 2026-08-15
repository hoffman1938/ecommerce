/**
 * The error boundary.
 *
 * Two rules the whole API follows:
 *
 *  1. A client sees a stable `code`, a human-readable `message` written for a
 *     shopper, and nothing else. No SQL, no stack, no table names, no file
 *     paths — a D1 error string routinely contains the failing statement.
 *  2. The server logs the detail, once, in a structured shape Cloudflare's
 *     Workers Logs will index.
 *
 * `ApiError` is the only way to produce a non-2xx body. Anything thrown that
 * is not one becomes a generic 500, which is exactly the behaviour we want for
 * a bug we have not thought about yet.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'INVALID_COUPON'
  | 'CART_EMPTY'
  | 'TOTALS_CHANGED'
  | 'RESERVATIONS_EXPIRED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  /*
   * A feature this deployment deliberately does not have, because having it
   * would mean paying somebody: sending email, taking a card. Distinct from
   * NOT_FOUND so the front end can say "this demo does not do that" rather
   * than "that page is missing", and distinct from INTERNAL so it is not
   * counted as a fault. See SECURITY.md.
   */
  | 'FEATURE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  INVALID_COUPON: 422,
  CART_EMPTY: 422,
  TOTALS_CHANGED: 409,
  RESERVATIONS_EXPIRED: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FEATURE_UNAVAILABLE: 501,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Extra fields the client is allowed to see (e.g. which field failed). */
    readonly details?: Record<string, unknown>,
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new ApiError('BAD_REQUEST', message, details);
export const unauthorized = (message = 'You need to sign in to do that.') =>
  new ApiError('UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new ApiError('FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError('NOT_FOUND', message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new ApiError('CONFLICT', message, details);

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

/**
 * Turns anything thrown into a client-safe body plus the line we log.
 *
 * The `requestId` is echoed to the client and printed in the log, so a
 * reviewer can quote the id from a red toast and it can be found in the
 * Worker's logs without the response ever having carried the detail.
 */
export function toErrorResponse(
  error: unknown,
  requestId: string,
): { status: number; body: ErrorBody; logDetail: string | undefined } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId,
      },
      // Expected, handled outcomes are not worth a stack trace; 5xx are.
      logDetail: error.status >= 500 ? (error.stack ?? error.message) : undefined,
    };
  }

  return {
    status: 500,
    body: {
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
      requestId,
    },
    logDetail: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
}
