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

/**
 * Interaction states are theme-aware because "one step darker on hover" is not
 * a rule that survives inversion — on a dark surface, hover has to go *up*.
 *
 * `secondary` and `ghost` are the ones that needed real work: both were painted
 * with the page colour, which is correct on white but leaves a button invisible
 * the moment it sits on a card in dark mode. Both now take an explicit surface
 * from the elevation ladder.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-hover active:bg-accent disabled:bg-ink-200 disabled:text-content-disabled',
  secondary:
    'bg-surface-card text-ink-900 ring-1 ring-inset ring-ink-300 hover:ring-ink-400 active:bg-surface-hover disabled:text-content-disabled disabled:ring-line disabled:bg-surface-card dark:ring-line-strong dark:hover:bg-surface-hover dark:hover:ring-ink-600',
  ghost:
    'bg-transparent text-ink-700 hover:bg-surface-hover hover:text-ink-950 active:bg-surface-active disabled:text-content-disabled',
  danger:
    // `text-ink-25` is already the dark label this coral needs in both themes.
    'bg-sale-500 text-ink-25 hover:bg-sale-600 active:bg-sale-700 disabled:bg-sale-200 disabled:text-ink-25 dark:hover:bg-sale-400',
  link: 'bg-transparent text-ink-900 underline underline-offset-[3px] decoration-ink-300 hover:decoration-ink-900 disabled:text-content-disabled disabled:no-underline',
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

/**
 * The shell every control shares.
 *
 * Checkout is where a dark theme is most likely to lose someone's trust, and a
 * field that is only findable by clicking is what does it.
 *
 * So in dark the field is a *well*: `surface-sunken`, one step below the card
 * it usually sits in. Recessing rather than raising is what makes a single rule
 * work everywhere — a field filled with the card colour disappeared the moment
 * it was placed on a card, which is where most of them are. Sunken reads as a
 * field on the page, on a card and inside a modal alike.
 *
 * Placeholder text moves up to `content-muted`, which clears 4.5:1 on the
 * field's own fill rather than only on the page.
 */
function fieldShell(hasError: boolean): string {
  return cx(
    'w-full rounded bg-ink-25 text-base text-ink-900 transition-shadow duration-150',
    'ring-1 ring-inset placeholder:text-ink-400',
    'hover:ring-ink-400',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-content-disabled disabled:ring-line',
    'dark:bg-surface-sunken dark:placeholder:text-content-muted',
    'dark:hover:bg-surface dark:disabled:bg-surface-sunken/60',
    // Focus itself is the global `:focus-visible` outline — one treatment for
    // native and custom controls alike, and it does not fire on mouse-down the
    // way a `focus:` ring would.
    hasError
      ? 'ring-sale-500 hover:ring-sale-600'
      : 'ring-ink-300 dark:ring-line-strong dark:hover:ring-ink-600',
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
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">
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
  // `neutral` uses `surface-active` rather than `ink-100`: in dark the two are
  // the same value as the card a badge normally sits on, so the badge vanished
  // into its own container.
  const neutral = 'bg-ink-100 text-ink-700 dark:bg-surface-active dark:text-ink-800';
  const tones: Record<BadgeTone, string> = {
    neutral,
    success: 'bg-success-100 text-success-700',
    sale: 'bg-sale-100 text-sale-700',
    warning: 'bg-warning-100 text-warning-700',
    info: 'bg-ink-900 text-ink-25',
    solid: 'bg-sale-500 text-ink-25',
    gray: neutral,
    green: 'bg-success-100 text-success-700',
    red: 'bg-sale-100 text-sale-700',
    yellow: 'bg-warning-100 text-warning-700',
    blue: 'bg-ink-900 text-ink-25',
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
          : 'border-ink-200 border-t-ink-900 dark:border-ink-300 dark:border-t-ink-800',
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
  // `info` was the page colour, which made it a borderless ghost on a dark
  // page; it now sits on the card surface like every other panel.
  const tones: Record<AlertTone, string> = {
    info: 'border-line bg-ink-25 text-ink-700 dark:bg-surface-card',
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
    <div className={cx('mx-auto max-w-sm py-12 text-center lg:py-16', className)}>
      <p className="text-lg font-semibold text-ink-950">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-500">
          {description}
        </p>
      ) : null}
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
export const StarIcon = icon(
  <path d="M10 3.2l2.1 4.2 4.7.7-3.4 3.3.8 4.6-4.2-2.2-4.2 2.2.8-4.6L3.2 8.1l4.7-.7L10 3.2Z" />,
);
export const ImageIcon = icon(
  <>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <circle cx="7.5" cy="7.5" r="1" />
    <path d="m3 13 4-4 3 3 2-2 5 5" />
  </>,
);
export const ChevronLeft = icon(<path d="m12.5 5-5 5 5 5" />);
export const ChevronUp = icon(<path d="m5 12.5 5-5 5 5" />);
export const PlusIcon = icon(<path d="M10 4v12M4 10h12" />);
export const MinusIcon = icon(<path d="M4 10h12" />);
export const ZoomInIcon = icon(
  <>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 3.5 3.5M9 6.75v4.5M6.75 9h4.5" />
  </>,
);
export const ZoomOutIcon = icon(
  <>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 3.5 3.5M6.75 9h4.5" />
  </>,
);
export const ExpandIcon = icon(<path d="M8 3H3v5M12 3h5v5M12 17h5v-5M8 17H3v-5" />);
export const FilterIcon = icon(
  <>
    <path d="M3 6h14M6 10h8M8.5 14h3" />
  </>,
);
export const TruckIcon = icon(
  <>
    <path d="M2.5 5.5h8v7h-8z" />
    <path d="M10.5 8h3l2 2.5v2h-5z" />
    <circle cx="6" cy="14" r="1.4" />
    <circle cx="13" cy="14" r="1.4" />
  </>,
);
export const ReturnIcon = icon(
  <>
    <path d="M7 4 4 7l3 3" />
    <path d="M4 7h7a4.5 4.5 0 0 1 0 9H6" />
  </>,
);
export const ShieldIcon = icon(
  <>
    <path d="M10 3 4.5 5v4.5c0 3.2 2.3 5.6 5.5 6.8 3.2-1.2 5.5-3.6 5.5-6.8V5L10 3Z" />
    <path d="m7.75 9.75 1.6 1.6 3-3.4" />
  </>,
);
export const SlidersIcon = icon(
  <>
    <path d="M4 6h12M4 14h12" />
    <circle cx="8" cy="6" r="1.75" />
    <circle cx="13" cy="14" r="1.75" />
  </>,
);

// --- Rating ----------------------------------------------------------------

const STAR_PATH =
  'M10 3.2l2.1 4.2 4.7.7-3.4 3.3.8 4.6-4.2-2.2-4.2 2.2.8-4.6L3.2 8.1l4.7-.7L10 3.2Z';

const RATING_SIZES = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5', lg: 'h-5 w-5' } as const;

/**
 * Five stars filled to a fractional rating via a clip, so 4.3 reads as 4.3
 * rather than being rounded to a whole star. The numeric value is exposed to
 * assistive tech through `aria-label`; the stars themselves are decorative.
 */
export function StarRating({
  value,
  size = 'md',
  className,
}: {
  /** 0–5. */
  value: number;
  size?: keyof typeof RATING_SIZES;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  // Unique per instance so multiple ratings on one page do not share a clip id.
  const clipId = `star-clip-${Math.round(clamped * 100)}-${size}`;

  return (
    <span
      className={cx('inline-flex items-center gap-px align-middle', className)}
      role="img"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, clamped - index));
        return (
          <svg
            key={index}
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={cx(RATING_SIZES[size], 'shrink-0')}
          >
            {/* The unfilled remainder. `ink-200` is the card surface itself in
                dark, which erased the track a 3.5-star rating is read against,
                so dark steps it up to the hairline value. */}
            <path d={STAR_PATH} className="fill-ink-200 dark:fill-ink-300" />
            {fill > 0 ? (
              <>
                <defs>
                  <clipPath id={`${clipId}-${index}`}>
                    <rect x="0" y="0" width={20 * fill} height="20" />
                  </clipPath>
                </defs>
                <path
                  d={STAR_PATH}
                  className="fill-warning-600"
                  clipPath={`url(#${clipId}-${index})`}
                />
              </>
            ) : null}
          </svg>
        );
      })}
    </span>
  );
}
