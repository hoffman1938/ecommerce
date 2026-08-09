'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, cx } from '@outlet/ui';

type ToastTone = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
  info: (message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Errors stay up longer — they are read, not glanced at. */
const DURATION: Record<ToastTone, number> = {
  success: 5000,
  info: 5000,
  error: 9000,
};

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message, action }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  // Timers outlive the toast list on unmount; clear them all rather than
  // leaving setState calls pointed at a torn-down tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, action) => push('success', message, action),
      error: (message) => push('error', message),
      info: (message, action) => push('info', message, action),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      // Polite: a toast confirming a save must not interrupt what the admin is
      // typing next.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'pointer-events-auto flex items-start gap-3 rounded-md border px-3.5 py-3 shadow-lg',
            toast.tone === 'success' && 'border-green-200 bg-green-50 text-green-900',
            toast.tone === 'error' && 'border-red-200 bg-red-50 text-red-900',
            toast.tone === 'info' && 'border-gray-200 bg-white text-gray-900',
          )}
        >
          <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                void toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="shrink-0 text-sm font-semibold underline underline-offset-2 hover:no-underline"
            >
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="-mr-1 shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
