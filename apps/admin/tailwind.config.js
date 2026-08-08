/** @type {import('tailwindcss').Config} */
module.exports = {
  // Shares the storefront's tokens so components in packages/ui render
  // identically in both apps.
  presets: [require('../../packages/ui/tailwind-preset.js')],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/dist/**/*.js',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
