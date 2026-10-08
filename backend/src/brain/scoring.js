import { config } from '../config.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * CLIP cosine -> 0..100. Calibrated on ViT-B/32:
 *  image-image: same product ~0.88+, same category ~0.75, unrelated ~0.55
 *  text-image:  good match ~0.32, unrelated ~0.18
 */
export function clipToScore(cos, mode = 'image') {
  const [lo, hi] = mode === 'image' ? [0.5, 0.88] : [0.18, 0.33];
  return Math.round(clamp(((cos - lo) / (hi - lo)) * 100));
}

/** Final score: vision-model verdict dominates, CLIP keeps it grounded. */
export function blendScore({ clip, llm }) {
  if (llm == null && clip == null) return 0;
  if (llm == null) return clip;
  if (clip == null) return llm;
  return Math.round(0.35 * clip + 0.65 * llm);
}

/**
 * Score when the vision model is busy: 55% visual (CLIP) + 45% caption/author words.
 * A post BY the brand or naming it is strong evidence, so it gets a floor of 60 (close match) plus up to 30 from visuals.
 */
export function fallbackScore({ clip, caption, byBrand }) {
  const base = 0.55 * clip + 0.45 * caption;
  return Math.round(byBrand ? Math.max(60 + 0.3 * clip, base) : base);
}

export function band(score) {
  if (score >= config.MATCH_THRESHOLD_EXACT) return 'exact';
  if (score >= config.MATCH_THRESHOLD_SHOW) return 'close';
  return 'below_threshold';
}
