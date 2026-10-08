import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { safeFetch } from '../utils/ssrf.js';
import { AppError } from '../utils/errors.js';

export const IMAGE_DIR = path.join(path.dirname(config.DB_PATH), 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Normalise any image to a <=768px JPEG, store it by content hash, return its handle */
export async function storeImage(buf) {
  let jpeg;
  try {
    jpeg = await sharp(buf).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw new AppError('BAD_IMAGE', 'That file is not a readable image.');
  }
  const hash = sha1(jpeg);
  const file = path.join(IMAGE_DIR, `${hash}.jpg`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, jpeg);
  return { hash, path: `/api/images/${hash}.jpg` };
}

export function readImage(hash) {
  const file = path.join(IMAGE_DIR, `${hash}.jpg`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/** Accepts a data: URL (upload) or a public http(s) URL */
export async function loadAndStoreImage(src) {
  let buf;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:image\/[\w+.-]+;base64,(.+)$/);
    if (!m) throw new AppError('BAD_IMAGE', 'Upload must be a PNG, JPEG or WebP image.');
    buf = Buffer.from(m[1], 'base64');
  } else {
    const res = await safeFetch(src, { maxBytes: 10_000_000, timeoutMs: 15000, headers: { accept: 'image/*' } });
    if (res.status !== 200) throw new AppError('IMAGE_FETCH_FAILED', `Could not download the product image (HTTP ${res.status}).`, 422);
    buf = res.body;
  }
  return storeImage(buf);
}
