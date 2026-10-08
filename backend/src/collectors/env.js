// Collector settings read straight from env so actor IDs can be swapped without code changes
const e = process.env;
export const collectorEnv = {
  APIFY_TOKEN: e.APIFY_TOKEN || '',
  IG_ACTOR: e.APIFY_IG_ACTOR || 'apify/instagram-hashtag-scraper',
  IG_FALLBACK_ACTOR: e.APIFY_IG_FALLBACK_ACTOR || 'apify/instagram-scraper',
  META_ACTOR: e.APIFY_META_ACTOR || 'curious_coder/facebook-ads-library-scraper',
  TIKTOK_ACTOR: e.APIFY_TIKTOK_ACTOR || 'clockworks/tiktok-scraper',
  META_COUNTRY: e.META_COUNTRY || 'ALL',
  META_USE_BROWSER_FIRST: (e.META_USE_BROWSER_FIRST || 'true') === 'true',
  RAW_CACHE_MS: Number(e.RAW_CACHE_HOURS || 24) * 3600 * 1000,
  TIKTOK_DOWNLOAD_VIDEOS: (e.TIKTOK_DOWNLOAD_VIDEOS || 'false') === 'true',
};
