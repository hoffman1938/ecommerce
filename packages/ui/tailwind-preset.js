/**
 * Shared design tokens for every @outlet frontend.
 *
 * Both apps extend this preset so the storefront and the admin panel cannot
 * drift apart, and so components in packages/ui can rely on these names being
 * defined wherever they are rendered.
 *
 * THEMING
 * -------
 * Colour is expressed in two layers, and new code should reach for the second.
 *
 * 1. `ink` — a *theme-relative* lightness scale backed by CSS variables (see
 *    apps/storefront/src/app/globals.css):
 *
 *      ink-25  = the lowest surface    (white in light, near-black in dark)
 *      ink-950 = primary content       (near-black in light, near-white in dark)
 *
 *    In dark mode the ramp inverts, so `text-ink-950` is the primary text
 *    colour in both themes. That keeps one set of class names working across
 *    themes instead of sprinkling `dark:` variants through every component.
 *
 * 2. Semantic tokens — `surface`, `line`, `content`, `accent`. These name the
 *    *role* rather than a position on a ramp, and they are what makes a real
 *    dark theme possible.
 *
 *    A single ramp cannot express dark elevation. On white, a page and a card
 *    are both white and a hairline does the separating, so `bg-ink-25` served
 *    both. On near-black they must differ — that tonal step *is* the hierarchy.
 *    So: page = `bg-surface`, card = `bg-surface-card`, modal/drawer =
 *    `bg-surface-raised`. In light all three resolve to white and the light
 *    theme is unchanged; in dark they separate into distinct planes.
 *
 *    The ladder, darkest to lightest in dark mode:
 *      surface → surface-sunken → surface-card → surface-raised → surface-hover
 *
 * Consequence worth knowing: literal `bg-white` / `text-white` do NOT theme.
 * Use them only over fixed-dark imagery (campaign scrims), where white is
 * correct in both themes — `bg-scrim-*` exists for exactly those wells.
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

/** Same, for a single-name token rather than a numeric ramp. */
function themedVar(name) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const INK_STOPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const SALE_STOPS = [50, 100, 200, 300, 400, 500, 600, 700];

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: themed('ink', INK_STOPS),
        sale: {
          ...themed('sale', SALE_STOPS),
          /**
           * Fixed, non-theming brand red for marks that sit *on product
           * photography*. The catalogue is shot on off-white, so a discount
           * badge is on a light ground in both themes — brightening it for
           * dark mode only broke it (white on #EC6A76 is 2.7:1).
           */
          brand: '#C8102E',
        },

        /**
         * Elevation ladder. Each step is a genuine plane, not a shade — in dark
         * mode the brightness difference is what separates page from card from
         * modal, which is why the theme does not need heavy shadows.
         */
        surface: {
          DEFAULT: themedVar('surface'),
          /** Recessed bands and image wells that sit *below* the page. */
          sunken: themedVar('surface-sunken'),
          card: themedVar('surface-card'),
          /** Modals, drawers, dropdowns, sticky bars — anything overlapping. */
          raised: themedVar('surface-raised'),
          hover: themedVar('surface-hover'),
          /** Pressed, selected, or otherwise held-open. */
          active: themedVar('surface-active'),
          /** Flips against the page: dark block on light, light block on dark. */
          inverse: themedVar('surface-inverse'),
        },

        /**
         * Hairlines. In dark these are translucent white, so a border brightens
         * as the surface under it rises — the same way real elevation reads.
         * No `<alpha-value>` support: the alpha is part of the token.
         */
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          /** For use on `surface-inverse`. */
          inverse: 'var(--line-inverse)',
        },

        /** Text roles. Ordered by descending prominence. */
        content: {
          DEFAULT: themedVar('content'),
          secondary: themedVar('content-secondary'),
          muted: themedVar('content-muted'),
          /** Still perceivable — a disabled control must not vanish. */
          disabled: themedVar('content-disabled'),
          /** For use on `surface-inverse`. */
          inverse: themedVar('content-inverse'),
        },

        /**
         * The primary call to action. Deliberately not the sale red: one accent
         * per job, and `sale` is spoken for. On dark this resolves to a bright
         * near-white block, which is the loudest a button can be without
         * shouting in colour.
         */
        accent: {
          DEFAULT: themedVar('accent'),
          hover: themedVar('accent-hover'),
          /** Label colour that sits on `accent`. */
          contrast: themedVar('accent-contrast'),
        },

        /**
         * Fixed dark neutrals that do NOT invert — image wells and scrims over
         * photography, where white text must stay legible in both themes.
         *
         * The values are exactly the light theme's `ink` steps, so swapping a
         * scrim from `ink-*` to `scrim-*` is a no-op in light and only changes
         * what happens in dark. That is what makes these substitutions safe to
         * apply to shared markup.
         */
        scrim: {
          700: '#42413D',
          800: '#292927',
          900: '#191918',
          950: '#0D0D0C',
        },

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

      /**
       * Driven by variables because a shadow that reads as depth on white is
       * invisible on near-black. The dark theme swaps in deeper, wider casts
       * and leans on `surface-*` brightness for most of the lifting.
       */
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        overlay: 'var(--shadow-overlay)',
        /** Hover lift for product tiles and other liftable cards. */
        lift: 'var(--shadow-lift)',
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

      backdropBlur: {
        header: '14px',
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
        /** Wishlist confirmation. One beat, no bounce back past rest. */
        'heart-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.28)' },
          '100%': { transform: 'scale(1)' },
        },
        /** Cart badge acknowledging an add. */
        'count-pop': {
          '0%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.2, 0, 0.13, 1)',
        'slide-up': 'slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        marquee: 'marquee 40s linear infinite',
        'heart-pop': 'heart-pop 240ms cubic-bezier(0.2, 0, 0.13, 1)',
        'count-pop': 'count-pop 220ms cubic-bezier(0.2, 0, 0.13, 1)',
      },
    },
  },
};
