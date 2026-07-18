import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

/**
 * Deliberately small, unstyled-framework component set (Tailwind classes)
 * shared between storefront and admin. The MVP prioritizes clarity over
 * visual polish; a future design system can replace these in one place.
 */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const styles: Record<string, string> = {
    primary: 'bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-400',
    secondary: 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function TextField({ label, error, id, className, ...props }: InputProps) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className={cx(
          'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900',
          error ? 'border-red-500' : 'border-gray-300',
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode;
  tone?: 'gray' | 'green' | 'red' | 'yellow' | 'blue';
}) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      {label}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'error' | 'warning';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
  };
  return <div className={cx('rounded-md border px-4 py-3 text-sm', tones[tone])}>{children}</div>;
}
