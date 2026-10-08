import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Local CLIP (runs on CPU, free, unlimited). Model downloads once (~90 MB) into backend/.cache/models
let loading = null;

async function load() {
  if (!loading) {
    loading = (async () => {
      const t = await import('@huggingface/transformers');
      t.env.cacheDir = path.resolve('.cache/models');
      const id = config.CLIP_MODEL;
      const opts = { dtype: 'q8' };
      const [processor, vision, tokenizer, text] = await Promise.all([
        t.AutoProcessor.from_pretrained(id),
        t.CLIPVisionModelWithProjection.from_pretrained(id, opts),
        t.AutoTokenizer.from_pretrained(id),
        t.CLIPTextModelWithProjection.from_pretrained(id, opts),
      ]);
      logger.info({ model: id }, 'CLIP model loaded');
      return { t, processor, vision, tokenizer, text };
    })().catch((err) => { loading = null; throw err; });
  }
  return loading;
}

const normalize = (arr) => {
  let s = 0;
  for (const v of arr) s += v * v;
  s = Math.sqrt(s) || 1;
  return Array.from(arr, (v) => v / s);
};

export const cosine = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

export async function embedImage(buf) {
  const m = await load();
  const image = await m.t.RawImage.fromBlob(new Blob([buf]));
  const inputs = await m.processor(image);
  const { image_embeds } = await m.vision(inputs);
  return normalize(image_embeds.data);
}

export async function embedText(text) {
  const m = await load();
  const inputs = m.tokenizer([text], { padding: true, truncation: true });
  const { text_embeds } = await m.text(inputs);
  return normalize(text_embeds.data);
}

export async function clipAvailable() {
  try { await load(); return true; } catch (err) { logger.warn({ err: err.message }, 'CLIP unavailable'); return false; }
}
