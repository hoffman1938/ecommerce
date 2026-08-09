'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx } from '@outlet/ui';

export interface ConfirmOptions {
  title: string;
  /** Say what will happen, in the admin's terms — not "are you sure?". */
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /**
   * When set, the admin must type this exact string to enable the confirm
   * button. Reserve it for actions with no undo and real blast radius.
   */
  requireTyped?: string;
}

/**
 * Confirmation dialog rendered as a modal over the panel.
 *
 * Portalled to <body> so it is never clipped or z-index-trapped by the panel's
 * sidebar/table layout, and so `fixed` positioning resolves against the
 * viewport regardless of what transforms sit above it in the tree.
 */
export function ConfirmDialog({
  open,
  options,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, busy, onCancel]);

  if (!mounted || !open || !options) return null;

  const needsTyping = Boolean(options.requireTyped);
  const canConfirm = !busy && (!needsTyping || typed === options.requireTyped);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={options.cancelLabel ?? 'Cancel'}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-gray-900">
          {options.title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-gray-600">{options.description}</div>

        {needsTyping ? (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-gray-700">
              Type <code className="rounded bg-gray-100 px-1 py-0.5">{options.requireTyped}</code>{' '}
              to confirm
            </span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cx(
              'inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              options.tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-900 hover:bg-gray-800',
            )}
          >
            {busy ? 'Working…' : (options.confirmLabel ?? 'Confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Imperative wrapper: `const confirm = useConfirm()` then
 * `if (await confirm({ ... })) { ... }`. Keeps call sites linear instead of
 * threading dialog state through every destructive handler.
 */
export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setState({ options, resolve }));

  const dialog = (
    <ConfirmDialog
      open={state !== null}
      options={state?.options ?? null}
      onConfirm={() => {
        state?.resolve(true);
        setState(null);
      }}
      onCancel={() => {
        state?.resolve(false);
        setState(null);
      }}
    />
  );

  return { confirm, dialog };
}
