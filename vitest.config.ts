import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // example/ holds unrelated reference libraries with their own test suites.
    exclude: ['**/node_modules/**', 'example/**'],
  },
});
