'use client';

import { useEffect, useState } from 'react';
import { cx } from '@outlet/ui';

const STORAGE_KEY = 'outlet-theme';

/**
 * Runs before first paint to set data-theme, so a dark-mode visitor never sees
 * a white flash on load. It has to be an inline blocking script: any React
 * effect runs after hydration, which is far too late.
 *
 * Kept deliberately tiny and dependency-free — it is parsed on every page load.
 */
export function ThemeScript() {
  // Also marks the document as JS-capable. Scroll-reveal keys its hidden
  // state off that class, so if scripting is unavailable nothing is ever
  // hidden waiting for an observer that will not run.
  const script = `(function(){var e=document.documentElement;e.classList.add('js');try{var s=localStorage.getItem('${STORAGE_KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;e.setAttribute('data-theme',s||(d?'dark':'light'));}catch(x){e.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2M15.7 4.3l-1 1M5.3 14.7l-1 1M15.7 15.7l-1-1M5.3 5.3l-1-1" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
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
      <path d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3Z" />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  // Read what ThemeScript already applied rather than recomputing it, so the
  // button never disagrees with the document.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked — the choice simply will not persist.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      // Until the effect runs we do not know the theme; label it neutrally
      // rather than claiming the wrong one to a screen reader.
      aria-label={theme ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` : 'Switch theme'}
      className={cx(
        'inline-flex h-10 w-10 items-center justify-center rounded text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950',
        className,
      )}
    >
      {/* Both icons render; CSS picks one via the dark variant, so there is no
          hydration mismatch and no icon swap flicker on load. */}
      <SunIcon className="hidden h-[18px] w-[18px] dark:block" />
      <MoonIcon className="h-[18px] w-[18px] dark:hidden" />
    </button>
  );
}
