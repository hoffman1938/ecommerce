/**
 * Shared design tokens for every @outlet frontend.
 *
 * Both apps extend this preset so the storefront and the admin panel cannot
 * drift apart, and so components in packages/ui can rely on these names being
 * defined wherever they are rendered.
 *
 * THEMING
 * -------
 * `ink` is not a fixed grey ramp — it is a *theme-relative* lightness scale
 * backed by CSS variables (see apps/storefront/src/app/globals.css):
 *
 *   ink-25  = the page surface      (white in light, near-black in dark)
 *   ink-950 = primary content       (near-black in light, near-white in dark)
 *
 * In dark mode the variables invert, so `text-ink-950` is the primary text
 * colour in both themes and `bg-ink-25` is the page in both themes. That keeps
 * one set of class names working across themes instead of sprinkling `dark:`
 * variants through every component.
 *
 * Consequence worth knowing: literal `bg-white` / `text-white` do NOT theme.
 * Use them only over fixed-dark imagery (campaign scrims), where white is
 * correct in both themes. Everywhere else use the ink scale.
 *
 * `sale` is the single accent — price reductions and destructive actions only.
 * It also shifts in dark mode, because #C8102E does not hold contrast on a
 * near-black surface.
 */

/** Builds `rgb(var(--x) / <alpha-value>)` entries so opacity utilities work. */
function themed(prefix, stops) {
  return Object.fromEntries(
    stops.map((stop) => [stop, `rgb(var(--${prefix}-${stop}) / <alpha-value>)`]),
  );
}

const INK_STOPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const SALE_STOPS = [50, 100, 200, 300, 400, 500, 600, 700];

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: themed('ink', INK_STOPS),
        sale: themed('sale', SALE_STOPS),
        success: {
          50: 'rgb(var(--success-50) / <alpha-value>)',
          100: 'rgb(var(--success-100) / <alpha-value>)',
          600: 'rgb(var(--success-600) / <alpha-value>)',
          700: 'rgb(var(--success-700) / <alpha-value>)',
        },
        warning: {
          50: 'rgb(var(--warning-50) / <alpha-value>)',
          100: 'rgb(var(--warning-100) / <alpha-value>)',
          600: 'rgb(var(--warning-600) / <alpha-value>)',
          700: 'rgb(var(--warning-700) / <alpha-value>)',
        },
      },

      // Explicit line-height and tracking on every step: the scale is the
      // typography system, so callers never hand-tune leading. The top end is
      // deliberately large — editorial commerce leads with type.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.6' }],
        lg: ['1.0625rem', { lineHeight: '1.5', letterSpacing: '-0.006em' }],
        xl: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.012em' }],
        '2xl': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.018em' }],
        '3xl': ['1.875rem', { lineHeight: '1.15', letterSpacing: '-0.022em' }],
        '4xl': ['2.25rem', { lineHeight: '1.08', letterSpacing: '-0.028em' }],
        '5xl': ['3rem', { lineHeight: '1.02', letterSpacing: '-0.032em' }],
        '6xl': ['3.75rem', { lineHeight: '0.98', letterSpacing: '-0.036em' }],
        '7xl': ['5rem', { lineHeight: '0.94', letterSpacing: '-0.04em' }],
        '8xl': ['6.75rem', { lineHeight: '0.9', letterSpacing: '-0.045em' }],
        '9xl': ['9rem', { lineHeight: '0.86', letterSpacing: '-0.05em' }],
      },

      borderRadius: {
        none: '0',
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },

      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        md: '0 2px 4px -1px rgb(0 0 0 / 0.05), 0 6px 16px -2px rgb(0 0 0 / 0.08)',
        overlay: '0 -1px 0 0 rgb(0 0 0 / 0.06), 0 -8px 24px -6px rgb(0 0 0 / 0.16)',
        none: 'none',
      },

      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0, 0.13, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        editorial: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },

      maxWidth: {
        page: '90rem',
        prose: '68ch',
      },

      screens: {
        xs: '440px',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.2, 0, 0.13, 1)',
        'slide-up': 'slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
};
