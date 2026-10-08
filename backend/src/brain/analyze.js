import { geminiJson, geminiEnabled } from './gemini.js';
import { readImage } from '../services/imageStore.js';
import { cache } from '../db.js';
import { logger } from '../logger.js';
import { sha1 } from '../services/imageStore.js';

const S = (description) => ({ type: 'STRING', description });
const A = (description) => ({ type: 'ARRAY', items: { type: 'STRING' }, description });

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    productType: S('Specific product type, e.g. "oversized t-shirt", "protein chocolate bar"'),
    category: S('Broad category, e.g. "apparel", "food", "skincare"'),
    brand: S('Brand if visible or known, else empty string'),
    colors: A('Main colours, most dominant first'),
    printOrGraphic: S('Description of prints, patterns or graphics, or "none"'),
    logos: A('Logos or brand marks visible'),
    textOnProduct: A('Readable text on the product or packaging'),
    material: S('Material or texture'),
    shape: S('Shape, silhouette, fit or packaging form'),
    distinctiveFeatures: A('3-5 visual details that tell THIS product apart from similar ones'),
    summary: S('One sentence describing exactly what the product looks like'),
    queries: {
      type: 'OBJECT',
      properties: {
        exact: A('2-3 search phrases naming this exact product (brand + product name)'),
        descriptive: A('3-4 phrases describing its look, e.g. "black skull print oversized tee"'),
        broad: A('2-3 broader category phrases used as a last resort'),
        hashtags: A('8-10 Instagram/TikTok hashtags WITHOUT the # sign, specific first'),
      },
      required: ['exact', 'descriptive', 'broad', 'hashtags'],
    },
  },
  required: ['productType', 'category', 'colors', 'printOrGraphic', 'logos', 'textOnProduct', 'material', 'shape', 'distinctiveFeatures', 'summary', 'queries'],
};

const tidyTag = (h) => h.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase();

/** Works without Gemini so the pipeline never dead-ends: plain keyword queries from the title */
export function fallbackAnalysis(product) {
  const title = (product.title || '').replace(/[|–-].*$/, '').trim();
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return {
    productType: title, category: '', brand: product.brand || '', colors: [], printOrGraphic: 'unknown', logos: [], textOnProduct: [],
    material: '', shape: '', distinctiveFeatures: [], summary: title,
    queries: {
      exact: [[product.brand, title].filter(Boolean).join(' ')].filter(Boolean),
      descriptive: [words.slice(0, 4).join(' ')].filter(Boolean),
      broad: [words.slice(-2).join(' ')].filter(Boolean),
      hashtags: [words.join(''), ...words].map(tidyTag).filter((h) => h.length > 2).slice(0, 8),
    },
    engine: 'fallback',
  };
}

/**
 * Step 1 of the brain: read the product photo (+ page text) and extract visual attributes
 * and a search plan. Cached by image hash + title, so repeat searches cost nothing.
 */
export async function analyzeProduct(product) {
  const key = `analysis:v1:${sha1(`${product.imageHash || ''}|${product.title || ''}|${product.description?.slice(0, 200) || ''}`)}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };
  if (!geminiEnabled()) return fallbackAnalysis(product);

  const parts = [{
    text: `You are the product-matching brain of a short-form video discovery tool for D2C ecommerce teams.
Analyse the product below so we can find Instagram Reels, Meta ads and TikToks that show THIS EXACT product (not just the category).
Be concrete and visual. Prefer details a viewer could see in a video frame.
Product title: ${product.title || '(unknown)'}
Brand: ${product.brand || '(unknown)'}
Description: ${(product.description || '').slice(0, 800) || '(none)'}
${product.imageHash ? 'The product photo is attached.' : 'No photo is available: infer from the text only.'}`,
  }];
  const img = product.imageHash ? readImage(product.imageHash) : null;
  if (img) parts.push({ image: img });

  try {
    const out = await geminiJson({ parts, schema: ANALYSIS_SCHEMA });
    out.queries.hashtags = [...new Set(out.queries.hashtags.map(tidyTag).filter((h) => h.length > 2))];
    out.engine = 'gemini';
    cache.set(key, out, 14 * 24 * 3600 * 1000);
    return out;
  } catch (err) {
    logger.warn({ err: err.message }, 'analysis failed, using fallback');
    return { ...fallbackAnalysis(product), warning: 'Vision model unavailable - used keyword-only analysis' };
  }
}

/** Ordered query ladder used by every collector: most specific first, broadest last */
export function queryLadder(analysis, product) {
  const q = analysis.queries || {};
  const ladder = [...(q.exact || []), product.inputType === 'keyword' ? product.title : null, ...(q.descriptive || []), ...(q.broad || [])]
    .filter(Boolean).map((s) => s.trim()).filter((s, i, a) => s && a.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);
  return { keywords: ladder, hashtags: q.hashtags || [] };
}
