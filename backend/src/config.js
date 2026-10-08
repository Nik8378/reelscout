import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  DB_PATH: z.string().default('./data/reelscout.db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_RPM: z.coerce.number().default(5),
  GEMINI_MAX_VERIFY: z.coerce.number().default(40),
  VERIFY_BUDGET_MS: z.coerce.number().default(90000),
  CLIP_MODEL: z.string().default('Xenova/clip-vit-base-patch32'),
  APIFY_TOKEN: z.string().default(''),
  RAPIDAPI_KEY: z.string().default(''),
  RAPIDAPI_IG_HOST: z.string().default(''),
  ENABLE_TIKTOK: z.string().default('true').transform((v) => v === 'true'),
  MIN_PER_SOURCE: z.coerce.number().default(20),
  MATCH_THRESHOLD_SHOW: z.coerce.number().default(50),
  MATCH_THRESHOLD_EXACT: z.coerce.number().default(70),
  SOURCE_TIMEOUT_MS: z.coerce.number().default(120000),
  MAX_CONCURRENT_SEARCHES: z.coerce.number().default(2),
});

export const config = schema.parse(process.env);

export function missingKeys() {
  const missing = [];
  if (!config.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (!config.APIFY_TOKEN) missing.push('APIFY_TOKEN');
  return missing;
}
