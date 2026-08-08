/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../packages/ui/tailwind-preset.js')],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/dist/**/*.js',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Supplied by next/font in app/layout.tsx; the stack after it is what
        // renders if the webfont is unavailable.
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
