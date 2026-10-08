import { normMeta } from './normalize.js';
import { logger } from '../logger.js';

/** Walk any JSON and pull out Ad Library ad nodes (objects that have ad_archive_id + snapshot) */
export function extractAdNodes(json, out = []) {
  if (!json || typeof json !== 'object') return out;
  if (Array.isArray(json)) {
    for (const x of json) extractAdNodes(x, out);
    return out;
  }
  if (json.ad_archive_id && json.snapshot) out.push(json);
  for (const k of Object.keys(json)) if (typeof json[k] === 'object') extractAdNodes(json[k], out);
  return out;
}

function parseMany(textBody) {
  const out = [];
  for (const chunk of textBody.replace(/^for \(;;\);/, '').split('\n')) {
    const s = chunk.trim();
    if (!s.startsWith('{')) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      /* partial chunk */
    }
  }
  return out;
}

/**
 * Free Meta Ad Library collector: opens the PUBLIC Ad Library page (no login),
 * reads the ads data the page itself loads, and scrolls for more.
 */
export async function scrapeAdLibrary({ query, country = 'ALL', limit = 30, timeoutMs = 60000 }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const found = new Map();
  const deadline = Date.now() + timeoutMs;
  try {
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/*', (route) =>
      ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue(),
    );
    page.on('response', async (res) => {
      if (!res.url().includes('/api/graphql')) return;
      try {
        for (const j of parseMany(await res.text())) for (const n of extractAdNodes(j)) found.set(n.ad_archive_id, n);
      } catch {
        /* ignore */
      }
    });
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=video`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    // first page of results is embedded in the HTML
    for (const s of await page
      .$$eval('script[type="application/json"]', (els) => els.map((e) => e.textContent))
      .catch(() => [])) {
      if (!s.includes('ad_archive_id')) continue;
      try {
        for (const n of extractAdNodes(JSON.parse(s))) found.set(n.ad_archive_id, n);
      } catch {
        /* ignore */
      }
    }
    let stale = 0;
    while (found.size < limit && Date.now() < deadline && stale < 4) {
      const before = found.size;
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1800);
      stale = found.size === before ? stale + 1 : 0;
    }
  } finally {
    await browser.close();
  }
  const items = [...found.values()].map(normMeta).filter(Boolean);
  logger.info({ query, raw: found.size, videos: items.length }, 'meta browser scrape finished');
  return items;
}
