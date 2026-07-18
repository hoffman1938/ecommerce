/** Shared ESLint config for Next.js apps. */
module.exports = {
  extends: ['next/core-web-vitals', 'prettier'],
  rules: {
    'react/no-unescaped-entities': 'off',
    '@next/next/no-img-element': 'off',
  },
  ignorePatterns: ['.next/', 'node_modules/', 'dist/'],
};
