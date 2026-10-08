import { runActor, SourceError } from './apify.js';
import { normInstagram, normMeta, normTikTok } from './normalize.js';
import { scrapeAdLibrary } from './metaBrowser.js';
import { collectorEnv as env } from './env.js';
import { logger } from '../logger.js';

// some actors return hashtag pages with posts nested inside
const flattenIg = (items) =>
  items.flatMap((it) => (it.topPosts || it.latestPosts ? [...(it.topPosts || []), ...(it.latestPosts || [])] : [it]));
const toTag = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const uniq = (a) => [...new Set(a.filter(Boolean))];
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * A source = plan(ladder) -> ordered tasks (specific first) + run(task, limit) -> normalized videos.
 * Each run() tries a primary method and falls back to a second one.
 */
export const instagram = {
  name: 'instagram',
  label: 'Instagram Reels',
  plan({ keywords, hashtags }) {
    const tags = uniq([...hashtags, ...keywords.slice(0, 4).map(toTag)]).filter((t) => t.length > 2 && t.length <= 30);
    return chunk(tags, 2).map((group) => ({ label: group.map((t) => `#${t}`).join(' '), tags: group }));
  },
  async run(task, limit) {
    const per = Math.max(10, Math.ceil(limit / task.tags.length));
    try {
      const items = await runActor(
        env.IG_ACTOR,
        { hashtags: task.tags, resultsType: 'reels', resultsLimit: per },
        { maxItems: per * task.tags.length },
      );
      const vids = flattenIg(items).map(normInstagram).filter(Boolean);
      if (vids.length) return vids;
    } catch (err) {
      if (['NO_TOKEN', 'AUTH', 'NO_CREDIT'].includes(err.code)) throw err;
      logger.warn({ err: err.message }, 'instagram primary failed, trying fallback actor');
    }
    const items = await runActor(
      env.IG_FALLBACK_ACTOR,
      {
        directUrls: task.tags.map((t) => `https://www.instagram.com/explore/tags/${t}/`),
        resultsType: 'posts',
        resultsLimit: per,
        addParentData: false,
      },
      { maxItems: per * task.tags.length * 2 },
    );
    return flattenIg(items).map(normInstagram).filter(Boolean);
  },
};

export const meta = {
  name: 'meta',
  label: 'Meta Ad Library',
  plan({ keywords }) {
    return keywords.slice(0, 8).map((k) => ({ label: `"${k}"`, query: k }));
  },
  async run(task, limit) {
    const viaApify = async () => {
      const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${env.META_COUNTRY}&q=${encodeURIComponent(task.query)}&search_type=keyword_unordered&media_type=video`;
      const items = await runActor(
        env.META_ACTOR,
        { urls: [{ url }], count: Math.max(limit, 20), scrapeAdDetails: false, 'scrapePageAds.activeStatus': 'all' },
        { maxItems: Math.max(limit, 20) },
      );
      return items.map(normMeta).filter(Boolean);
    };
    const viaBrowser = () => scrapeAdLibrary({ query: task.query, country: env.META_COUNTRY, limit });
    const [first, second] = env.META_USE_BROWSER_FIRST ? [viaBrowser, viaApify] : [viaApify, viaBrowser];
    let firstWorked = false;
    try {
      const vids = await first();
      firstWorked = true;
      if (vids.length) return vids;
    } catch (err) {
      logger.warn({ err: err.message }, 'meta primary failed, trying fallback');
    }
    try {
      return await second();
    } catch (err) {
      if (firstWorked) return []; // primary works, just no results for this query - keep going
      throw err;
    }
  },
};

export const tiktok = {
  name: 'tiktok',
  label: 'TikTok',
  optional: true,
  plan({ keywords, hashtags }) {
    return [
      ...keywords.slice(0, 4).map((k) => ({ label: `"${k}"`, searchQueries: [k] })),
      ...chunk(hashtags.slice(0, 4), 2).map((g) => ({ label: g.map((t) => `#${t}`).join(' '), hashtags: g })),
    ];
  },
  async run(task, limit) {
    const items = await runActor(
      env.TIKTOK_ACTOR,
      {
        ...(task.searchQueries ? { searchQueries: task.searchQueries } : { hashtags: task.hashtags }),
        resultsPerPage: Math.max(limit, 10),
        shouldDownloadVideos: env.TIKTOK_DOWNLOAD_VIDEOS,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      },
      { maxItems: Math.max(limit, 10) },
    );
    return items.map(normTikTok).filter(Boolean);
  },
};

export const SOURCES = { instagram, meta, tiktok };
export { SourceError };
