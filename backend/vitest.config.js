import { defineConfig } from 'vitest/config';
// tests use their own throwaway database
export default defineConfig({ test: { env: { DB_PATH: './data/test.db', LOG_LEVEL: 'silent', GEMINI_API_KEY: '', APIFY_TOKEN: '' } } });
