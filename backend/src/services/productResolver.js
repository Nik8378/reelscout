import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { safeFetch, assertSafeUrl } from '../utils/ssrf.js';
import { cache } from '../db.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../logger.js';
import { loadAndStoreImage, sha1, IMAGE_DIR } from './imageStore.js';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const stripHtml = (html) => clean(cheerio.load(`<div>${html || ''}</div>`).text());
const firstImage = (img) => {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  return img.url || img.contentUrl || img.src || null;
};

function findJsonLdProduct($) {
  const found = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).contents().text().trim()); } catch { return; }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) { stack.push(...n); continue; }
      const types = [].concat(n['@type'] || []);
      if (types.some((t) => /^(Product|ProductGroup|IndividualProduct)$/i.test(t))) found.push(n);
      if (n['@graph']) stack.push(n['@graph']);
      if (n.mainEntity) stack.push(n.mainEntity);
    }
  });
  return found[0] || null;
}

/** Pure HTML -> product fields. Order: JSON-LD > Amazon DOM > Open Graph > <title> */
export function parseProductHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const ld = findJsonLdProduct($);
  const meta = (n) => $(`meta[property="${n}"]`).attr('content') || $(`meta[name="${n}"]`).attr('content');

  let amazonImg = $('#landingImage').attr('data-old-hires') || null;
  const dyn = $('#landingImage').attr('data-a-dynamic-image');
  if (!amazonImg && dyn) { try { amazonImg = Object.keys(JSON.parse(dyn))[0]; } catch { /* ignore */ } }
  const amazonTitle = clean($('#productTitle').text());

  const title = clean(ld?.name || amazonTitle || meta('og:title') || meta('twitter:title') || $('title').first().text());
  const description = stripHtml(ld?.description || meta('og:description') || meta('description') || $('#feature-bullets').text()).slice(0, 1200);
  let image = firstImage(ld?.image) || amazonImg || meta('og:image:secure_url') || meta('og:image') || meta('twitter:image');
  if (image) image = new URL(image.startsWith('//') ? `https:${image}` : image, pageUrl).toString();
  const brandRaw = typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name;
  const brand = clean(brandRaw || $('#bylineInfo').text().replace(/^(Visit the|Brand:)\s*/i, '').replace(/\s*Store$/i, '') || meta('og:site_name'));
  const offer = ld?.offers ? [].concat(ld.offers)[0] : null;
  const price = offer?.price || offer?.lowPrice || meta('product:price:amount') || null;
  const source = ld ? 'json-ld' : amazonTitle ? 'amazon-dom' : meta('og:title') ? 'open-graph' : 'html-title';
  return { title, description, image: image || null, brand: brand || null, price: price ? String(price) : null, source };
}

/** Shopify stores expose /products/<handle>.js - most reliable source for D2C brands */
async function tryShopify(url) {
  const u = new URL(url);
  const m = u.pathname.match(/\/products\/([^/?#.]+)/);
  if (!m) return null;
  try {
    const res = await safeFetch(`${u.origin}/products/${m[1]}.js`, { timeoutMs: 8000, headers: { accept: 'application/json' } });
    if (res.status !== 200) return null;
    const p = JSON.parse(res.body.toString('utf8'));
    let image = firstImage(p.featured_image || p.images);
    if (image?.startsWith('//')) image = `https:${image}`;
    return { title: clean(p.title), description: stripHtml(p.description).slice(0, 1200), image, brand: p.vendor || null, price: p.price ? (p.price / 100).toFixed(2) : null, source: 'shopify-json' };
  } catch {
    return null;
  }
}

/** Fallback for JS-rendered or bot-protected pages. Playwright is optional (installed in step 4). */
async function renderWithBrowser(url) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { return null; }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'en-US' });
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (['image', 'media', 'font'].includes(req.resourceType())) return route.abort();
      if (req.resourceType() === 'document') {
        try { await assertSafeUrl(req.url()); } catch { return route.abort(); }
      }
      return route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await browser.close();
  }
}

const isBlocked = (status, html) => status >= 400 || /captcha|robot check|access denied|are you a human/i.test(html.slice(0, 30000));

async function readProductPage(url) {
  await assertSafeUrl(url);
  let product = await tryShopify(url);
  if (!product?.title || !product?.image) {
    let parsed = null;
    try {
      const res = await safeFetch(url);
      const html = res.body.toString('utf8');
      if (!isBlocked(res.status, html)) parsed = parseProductHtml(html, res.url);
      else logger.info({ url, status: res.status }, 'product page blocked plain fetch, trying browser');
    } catch (err) {
      if (err.code === 'UNSAFE_URL') throw err;
      logger.warn({ url, err: err.message }, 'plain fetch failed');
    }
    if (!parsed?.title || !parsed?.image) {
      const rendered = await renderWithBrowser(url).catch((e) => { logger.warn({ err: e.message }, 'browser render failed'); return null; });
      if (rendered && !isBlocked(200, rendered)) parsed = parseProductHtml(rendered, url);
    }
    product = { ...(parsed || {}), ...Object.fromEntries(Object.entries(product || {}).filter(([, v]) => v)) };
  }
  if (!product?.title) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Could not read a product from that page.', 422, 'The site may block automated visits. Search by product name and upload the product photo instead.');
  }
  return product;
}

/**
 * Builds the search context from any mix of: keyword, product URL, uploaded image.
 * Product pages and images are cached so the same link is never processed twice.
 */
export async function resolveProduct({ type, value, image }) {
  let product;
  if (type === 'url') {
    const key = `product:${sha1(value)}`;
    const hit = cache.get(key);
    if (hit && (!hit.imageHash || fs.existsSync(path.join(IMAGE_DIR, `${hit.imageHash}.jpg`)))) {
      product = { ...hit, cached: true };
    } else {
      const page = await readProductPage(value);
      product = { inputType: 'url', url: value, ...page, imageUrl: page.image, imageHash: null, imagePath: null };
      if (page.image) {
        try {
          const img = await loadAndStoreImage(page.image);
          product.imageHash = img.hash;
          product.imagePath = img.path;
        } catch (err) {
          logger.warn({ err: err.message }, 'product image download failed');
        }
      }
      delete product.image;
      cache.set(key, product, 3 * 24 * 3600 * 1000);
      product.cached = false;
    }
  } else {
    product = { inputType: value ? 'keyword' : 'image', title: value || '', description: '', brand: null, price: null, url: null, imageUrl: null, imageHash: null, imagePath: null, source: 'keyword' };
  }

  if (image) {
    const img = await loadAndStoreImage(image);
    product = { ...product, imageHash: img.hash, imagePath: img.path, imageSource: 'upload' };
  } else if (product.imageHash) {
    product.imageSource = 'product-page';
  }
  return product;
}
