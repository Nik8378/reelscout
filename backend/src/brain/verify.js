import sharp from 'sharp';
import { geminiJson, geminiEnabled } from './gemini.js';
import { embedImage, embedText, cosine, clipAvailable } from './clip.js';
import { clipToScore, blendScore, band } from './scoring.js';
import { readImage } from '../services/imageStore.js';
import { cleanTitle } from './analyze.js';
import { cache } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const CHECK = { type: 'STRING', enum: ['match', 'partial', 'no', 'n/a'] };
const VERIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER' },
          score: { type: 'INTEGER', description: '0-100: 90+ exact same product clearly shown, 70-89 very likely same product, 50-69 close visual match, 20-49 same category only, 0-19 unrelated' },
          reason: { type: 'STRING', description: 'Max 15 words, concrete, e.g. "same skull print and black colour, worn by a model"' },
          checks: {
            type: 'OBJECT',
            properties: { print: CHECK, colour: CHECK, shape: CHECK, logoText: CHECK, productVisible: CHECK },
            required: ['print', 'colour', 'shape', 'logoText', 'productVisible'],
          },
        },
        required: ['index', 'score', 'reason', 'checks'],
      },
    },
  },
  required: ['results'],
};

const small = (buf) => sharp(buf).resize(384, 384, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();

async function productEmbedding(product, analysis) {
  const key = `clip:ref:${product.imageHash || product.title}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let ref;
  if (product.imageHash) ref = { mode: 'image', vec: await embedImage(readImage(product.imageHash)) };
  else ref = { mode: 'text', vec: await embedText(`a photo of ${analysis.summary || product.title}`) };
  cache.set(key, ref, 30 * 24 * 3600 * 1000);
  return ref;
}

/**
 * Step 2 of the brain. candidates: [{ id, thumbBuf, caption }]
 * 1) CLIP similarity for every candidate (fast, local)
 * 2) Gemini compares the product photo with batches of 8 thumbnails and explains each score
 * Returns Map(id -> { score, clipScore, llmScore, reason, checks, band })
 */
export async function scoreCandidates({ product, analysis, candidates, onProgress = () => {} }) {
  const out = new Map();
  const NOISE = /^(\d+\w*|pack|with|and|for|the|of|per|new|buy|online|price)$/;
  const keyWords = [...new Set(`${cleanTitle(product.title)} ${analysis.productType || ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !NOISE.test(w)))];
  const brandKey = (product.brand || analysis.brand || '').toLowerCase().split(/\s+/)[0] || '';
  // caption/author signal: naming the brand is strong evidence, product words are weaker evidence
  const captionScore = (cap, author) => {
    const c = `${cap || ''} ${author || ''}`.toLowerCase();
    const words = keyWords.length ? keyWords.filter((w) => c.includes(w)).length / keyWords.length : 0;
    if (brandKey.length > 2 && c.replace(/\s+/g, '').includes(brandKey)) return Math.round(70 + 30 * words);
    return Math.round(80 * words);
  };
  const withThumb = candidates.filter((c) => c.thumbBuf);

  // 1) CLIP
  let ref = null;
  if (await clipAvailable()) {
    try { ref = await productEmbedding(product, analysis); } catch (err) { logger.warn({ err: err.message }, 'reference embedding failed'); }
  }
  for (const c of withThumb) {
    let clipScore = null;
    if (ref) {
      try { clipScore = clipToScore(cosine(ref.vec, await embedImage(c.thumbBuf)), ref.mode); } catch { /* bad image */ }
    }
    out.set(c.id, { clipScore, llmScore: null, reason: null, checks: null });
  }
  onProgress({ stage: 'clip', done: withThumb.length });

  // 2) Gemini verification on the most promising candidates
  if (geminiEnabled()) {
    const ranked = [...withThumb].sort((a, b) => (out.get(b.id).clipScore ?? 50) - (out.get(a.id).clipScore ?? 50)).slice(0, config.GEMINI_MAX_VERIFY);
    const refImg = product.imageHash ? await small(readImage(product.imageHash)) : null;
    const batches = [];
    for (let i = 0; i < ranked.length; i += 10) batches.push(ranked.slice(i, i + 10));
    let done = 0;
    const deadline = Date.now() + config.VERIFY_BUDGET_MS;
    // keyword search without a photo = the user wants this TYPE of product, any brand (unless one is named)
    const generic = !product.imageHash && product.inputType !== 'url';
    const task = generic
      ? `The user searched by keyword for a type of product: "${product.title}". Score how clearly each video thumbnail shows this kind of product (any brand, unless a brand is named in the search).`
      : 'Decide whether each video thumbnail shows THIS EXACT product.';
    const rule = generic
      ? 'Score 70+ when this kind of product is clearly visible; 50-69 when related but partly visible or a close variant; below 50 for a different product type or when no product is visible.'
      : 'Same category but different design/print/colour must score below 50.';
    await Promise.all(batches.map(async (batch) => {
      const parts = [{
        text: `${task}
Product: ${analysis.summary || product.title}
Key visual details: ${[analysis.printOrGraphic, ...(analysis.colors || []), ...(analysis.distinctiveFeatures || []), ...(analysis.logos || [])].filter(Boolean).join('; ')}
${refImg ? 'Image 0 is the REFERENCE product photo.' : 'No reference photo: judge from the description.'} The following images are candidates numbered 1..${batch.length} in order.
${rule} Thumbnails can be cropped, worn on a person, mirrored or have text overlays - judge the product itself.
Caption hints (may be wrong): ${batch.map((c, i) => `${i + 1}: ${(c.caption || '').slice(0, 120).replace(/\s+/g, ' ')}`).join(' | ')}`,
      }];
      if (refImg) parts.push({ image: refImg });
      for (const c of batch) parts.push({ image: await small(c.thumbBuf).catch(() => c.thumbBuf) });
      try {
        const res = await geminiJson({ parts, schema: VERIFY_SCHEMA, temperature: 0.1, deadline });
        for (const r of res.results || []) {
          const c = batch[r.index - 1];
          if (!c) continue;
          Object.assign(out.get(c.id), { llmScore: Math.max(0, Math.min(100, r.score)), reason: r.reason, checks: r.checks });
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'verify batch failed - CLIP score only');
      }
      done += batch.length;
      onProgress({ stage: 'verify', done, total: ranked.length });
    }));
  }

  // 3) blend + explain
  for (const c of candidates) {
    const s = out.get(c.id) || { clipScore: null, llmScore: null };
    const capScore = captionScore(c.caption, c.author);
    const score = s.llmScore == null && s.clipScore != null ? Math.round(0.55 * s.clipScore + 0.45 * capScore) : blendScore({ clip: s.clipScore, llm: s.llmScore });
    const reason = s.reason
      || (s.clipScore != null ? `Visual similarity ${s.clipScore}/100, caption match ${capScore}/100 (vision model not used)` : 'No thumbnail available to compare');
    out.set(c.id, { ...s, score, reason, band: band(score) });
  }
  return out;
}
