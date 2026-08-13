// .cjs rather than .js: this package is "type": "module", and ESLint 8 loads
// its config with require().
module.exports = {
  root: true,
  extends: ['@outlet/eslint-config'],
  env: {
    // Workers is neither Node nor a browser: it has fetch, crypto, Request and
    // Response from the web platform, and none of Node's globals unless
    // nodejs_compat is on. `worker` is the closest predefined set.
    worker: true,
    browser: true,
  },
  overrides: [
    {
      // The seed and deployment scripts are plain Node ESM, run from a
      // terminal rather than in the Worker.
      files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
      env: { node: true, worker: false, browser: false },
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
    },
  ],
};
