import { forwardRef } from 'react';
import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';

/**
 * Shared primitives for the storefront and admin panel.
 *
 * These own every interaction state (hover, focus-visible, active, disabled)
 * so pages never restate them. Focus rings come from the global
 * `:focus-visible` rule, not from per-component ring classes, which keeps the
 * treatment identical across native and custom controls.
 *
 * Tokens used here are defined in packages/ui/tailwind-preset.js, which both
 * apps load as a Tailwind preset.
 */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// --- Button ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks input without changing the button's width. */
  loading?: boolean;
  fullWidth?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-950 text-white hover:bg-ink-800 active:bg-ink-900 disabled:bg-ink-200 disabled:text-ink-400',
  secondary:
    'bg-white text-ink-900 ring-1 ring-inset ring-ink-300 hover:bg-ink-25 hover:ring-ink-400 active:bg-ink-50 disabled:text-ink-400 disabled:ring-ink-200 disabled:bg-white',
  ghost:
    'bg-transparent text-ink-700 hover:bg-ink-100 hover:text-ink-950 active:bg-ink-200 disabled:text-ink-300',
  danger:
    'bg-sale-500 text-white hover:bg-sale-600 active:bg-sale-700 disabled:bg-sale-200 disabled:text-white',
  link: 'bg-transparent text-ink-900 underline underline-offset-[3px] decoration-ink-300 hover:decoration-ink-900 disabled:text-ink-400 disabled:no-underline',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded font-medium transition-[background-color,color,box-shadow] duration-150',
        'disabled:cursor-not-allowed',
        variant === 'link' ? 'h-auto p-0' : BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" tone="current" /> : null}
      {children}
    </button>
  );
}

// --- Form fields -----------------------------------------------------------

function fieldShell(hasError: boolean): string {
  return cx(
    'w-full rounded bg-white text-base text-ink-900 transition-shadow duration-150',
    'ring-1 ring-inset placeholder:text-ink-400',
    'hover:ring-ink-400',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400 disabled:ring-ink-200',
    hasError ? 'ring-sale-500 hover:ring-sale-600' : 'ring-ink-300',
  );
}

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, hint and error layout shared by every control. */
export function Field({
  label,
  hint,
  error,
  id,
  required,
  className,
  children,
}: FieldWrapperProps) {
  return (
    <div className={cx('min-w-0', className)}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-ink-800"
        >
          {label}
          {required ? <span className="ml-0.5 text-sale-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-sale-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/** forwardRef so react-hook-form's `register()` can attach its ref. */
export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, id, className, required, ...props },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id}
      required={required}
      className={className}
    >
      <input
        id={id}
        ref={ref}
        className={cx(fieldShell(Boolean(error)), 'h-10 px-3')}
        aria-invalid={Boolean(error) || undefined}
        required={required}
        {...props}
      />
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, hint, error, id, className, children, required, ...props },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id}
      required={required}
      className={className}
    >
      <div className="relative">
        <select
          id={id}
          ref={ref}
          className={cx(
            fieldShell(Boolean(error)),
            'h-10 cursor-pointer appearance-none py-0 pl-3 pr-9',
          )}
          aria-invalid={Boolean(error) || undefined}
          required={required}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
      </div>
    </Field>
  );
});

// --- Status ----------------------------------------------------------------

type BadgeTone =
  | 'neutral'
  | 'success'
  | 'sale'
  | 'warning'
  | 'info'
  | 'solid'
  /** Legacy palette names, still used by the admin panel. Prefer the semantic
   *  names above, or `statusTone()` for domain statuses. */
  | 'gray'
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue';

/**
 * Maps an order, payment, shipment, return or refund status to a badge tone,
 * so the mapping lives in one place instead of being re-derived as a ternary
 * at every call site.
 */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'PAID':
    case 'DELIVERED':
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'APPROVED':
    case 'RECEIVED':
      return 'success';
    case 'CANCELLED':
    case 'FAILED':
    case 'REJECTED':
      return 'sale';
    case 'AWAITING_PAYMENT':
    case 'PENDING':
    case 'PROCESSING':
    case 'REQUESTED':
      return 'warning';
    case 'SHIPPED':
    case 'PACKED':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * Reserved for genuine status (order state, stock level). Not a decorative
 * label — if it isn't communicating state, it should be plain text.
 */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-ink-100 text-ink-700',
    success: 'bg-success-100 text-success-700',
    sale: 'bg-sale-100 text-sale-700',
    warning: 'bg-warning-100 text-warning-700',
    info: 'bg-ink-900 text-white',
    solid: 'bg-sale-500 text-white',
    gray: 'bg-ink-100 text-ink-700',
    green: 'bg-success-100 text-success-700',
    red: 'bg-sale-100 text-sale-700',
    yellow: 'bg-warning-100 text-warning-700',
    blue: 'bg-ink-900 text-white',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-xs px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.05em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({
  size = 'md',
  tone = 'muted',
  label,
}: {
  size?: 'sm' | 'md';
  tone?: 'muted' | 'current';
  label?: string;
}) {
  const spinner = (
    <span
      className={cx(
        'inline-block shrink-0 animate-spin rounded-full border-2 border-solid',
        size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
        tone === 'current'
          ? 'border-current/30 border-t-current'
          : 'border-ink-200 border-t-ink-900',
      )}
    />
  );
  if (!label) return spinner;
  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-ink-500"
      role="status"
      aria-live="polite"
    >
      {spinner}
      {label}
    </span>
  );
}

type AlertTone = 'info' | 'success' | 'error' | 'warning';

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones: Record<AlertTone, string> = {
    info: 'border-ink-200 bg-ink-25 text-ink-700',
    success: 'border-success-100 bg-success-50 text-success-700',
    error: 'border-sale-200 bg-sale-50 text-sale-700',
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
  };
  return (
    <div
      className={cx('rounded border px-3.5 py-3 text-sm', tones[tone], className)}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

/** Rectangular loading placeholder. Shape it with width/height classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded', className)} aria-hidden="true" />;
}

/**
 * Consistent empty state. Deliberately plain: a heading, a line of guidance
 * and at most one action, centred in the space the content would have used.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mx-auto max-w-sm py-16 text-center', className)}>
      <p className="text-lg font-semibold text-ink-950">{title}</p>
      {description ? <p className="mt-1.5 text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// --- Icons -----------------------------------------------------------------

/**
 * A handful of inline icons, stroked to match the type weight. Keeping them
 * here avoids pulling in an icon package for six glyphs.
 */
type IconProps = { className?: string };

function icon(path: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        {path}
      </svg>
    );
  };
}

export const ChevronDown = icon(<path d="m5 7.5 5 5 5-5" />);
export const ChevronRight = icon(<path d="m7.5 5 5 5-5 5" />);
export const SearchIcon = icon(
  <>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 3.5 3.5" />
  </>,
);
export const CloseIcon = icon(<path d="m5 5 10 10M15 5 5 15" />);
export const MenuIcon = icon(<path d="M3 6h14M3 10h14M3 14h14" />);
export const BagIcon = icon(
  <>
    <path d="M4.5 6.5h11l-.9 9.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3L4.5 6.5Z" />
    <path d="M7.5 8V5.75a2.5 2.5 0 0 1 5 0V8" />
  </>,
);
export const HeartIcon = icon(
  <path d="M10 16s-5.5-3.5-5.5-7A2.9 2.9 0 0 1 10 7.2 2.9 2.9 0 0 1 15.5 9c0 3.5-5.5 7-5.5 7Z" />,
);
export const UserIcon = icon(
  <>
    <circle cx="10" cy="7" r="2.75" />
    <path d="M4.5 16.5a5.5 5.5 0 0 1 11 0" />
  </>,
);
export const CheckIcon = icon(<path d="m4.5 10.5 3.5 3.5 7.5-8" />);
