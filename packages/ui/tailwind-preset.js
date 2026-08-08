/**
 * Shared design tokens for every @outlet frontend.
 *
 * Both apps extend this preset so the storefront and the admin panel cannot
 * drift apart, and so components in packages/ui can rely on these names being
 * defined wherever they are rendered.
 *
 * Principles encoded here:
 *  - One neutral ramp, very slightly warm, so large flat areas do not read
 *    cold and screen-blue the way default grays do.
 *  - One accent (`sale`) used for price reductions and destructive actions
 *    only. Everything else is neutral. Colour carries meaning, not decoration.
 *  - A restrained radius scale. Nothing above 8px except deliberate pills.
 *  - Three shadows, all subtle. Hierarchy comes from borders, weight and
 *    spacing — not from floating every element off the page.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Page and surface neutrals. `ink` is the text/UI ramp.
        ink: {
          25: '#FAFAF9',
          50: '#F5F5F3',
          100: '#EBEBE8',
          200: '#DEDDD9',
          300: '#C6C5C0',
          400: '#A2A19B',
          500: '#7B7A74',
          600: '#5A5954',
          700: '#42413D',
          800: '#292927',
          900: '#191918',
          950: '#0D0D0C',
        },
        // Retail sale red. Deep and flat — not neon, never a gradient.
        sale: {
          50: '#FEF3F3',
          100: '#FDE4E5',
          200: '#FAC7CB',
          300: '#F29AA1',
          400: '#E45E6A',
          500: '#C8102E',
          600: '#AB0C27',
          700: '#8B0A1F',
          800: '#6E0819',
          900: '#4F0512',
        },
        success: {
          50: '#F1F7F3',
          100: '#DCEDE2',
          600: '#2F6B47',
          700: '#255539',
        },
        warning: {
          50: '#FDF6EC',
          100: '#F9E8CC',
          600: '#8A5A11',
          700: '#6E470D',
        },
      },

      // Explicit line-height and tracking on every step: the scale is the
      // typography system, so callers never hand-tune leading.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.6' }],
        lg: ['1.0625rem', { lineHeight: '1.5', letterSpacing: '-0.006em' }],
        xl: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.012em' }],
        '2xl': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.018em' }],
        '3xl': ['1.875rem', { lineHeight: '1.18', letterSpacing: '-0.022em' }],
        '4xl': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.028em' }],
        '5xl': ['3rem', { lineHeight: '1.04', letterSpacing: '-0.032em' }],
        '6xl': ['3.75rem', { lineHeight: '1', letterSpacing: '-0.036em' }],
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
        xs: '0 1px 2px 0 rgb(13 13 12 / 0.04)',
        sm: '0 1px 2px 0 rgb(13 13 12 / 0.04), 0 1px 3px 0 rgb(13 13 12 / 0.06)',
        md: '0 2px 4px -1px rgb(13 13 12 / 0.05), 0 6px 16px -2px rgb(13 13 12 / 0.08)',
        // For sticky bars and drawers only.
        overlay: '0 -1px 0 0 rgb(13 13 12 / 0.06), 0 -8px 24px -6px rgb(13 13 12 / 0.10)',
        none: 'none',
      },

      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0, 0.13, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },

      maxWidth: {
        page: '80rem',
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
      },
      animation: {
        'fade-in': 'fade-in 150ms cubic-bezier(0.2, 0, 0.13, 1)',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
};
