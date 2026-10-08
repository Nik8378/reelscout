import { defineConfig } from 'vitest/config';
// tests use their own throwaway database, wiped before every run
export default defineConfig({
  test: {
    globalSetup: './test/setup-db.js',
    env: { DB_PATH: './data/test.db', LOG_LEVEL: 'silent', GEMINI_API_KEY: '', APIFY_TOKEN: '' },
  },
});
