import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // work/ holds disposable, gitignored scratch output (including, at
    // times, full copies of a test tree for the mutation test - see
    // src/verify/mutation-test.mjs) and local-samples/ holds local-only
    // license-unconfirmed assets - neither should ever be picked up by
    // `npm test`'s default file scan.
    exclude: ['**/node_modules/**', '**/work/**', '**/local-samples/**'],
  },
});
