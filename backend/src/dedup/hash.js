import crypto from 'node:crypto';
import sharp from 'sharp';

// DCT cosine table for a 32x32 transform (computed once)
const N = 32;
const COS = Array.from({ length: N }, (_, k) =>
  Array.from({ length: N }, (_, n) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N))),
);

/**
 * 64-bit perceptual hash (pHash): 32x32 greyscale -> 2D DCT -> 8x8 low frequencies vs their median.
 * Robust to resizing, re-encoding, small crops, colour shifts and flat product backgrounds.
 */
export async function dHash(buf, { flip = false } = {}) {
  let img = sharp(buf).grayscale().blur(0.6);
  if (flip) img = img.flop();
  const px = await img.resize(N, N, { fit: 'fill' }).raw().toBuffer();
  const rows = Array.from({ length: N }, (_, y) =>
    Array.from({ length: 8 }, (_, u) => {
      let s = 0;
      for (let x = 0; x < N; x++) s += px[y * N + x] * COS[u][x];
      return s;
    }),
  );
  const coeffs = [];
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y][u] * COS[v][y];
      coeffs.push(s);
    }
  }
  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  let bits = 0n;
  for (const c of coeffs) bits = (bits << 1n) | (c > median ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}

export function hamming(a, b) {
  if (!a || !b) return 64;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Same video file served with different signed query strings -> same hash */
export function mediaHash(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return crypto
      .createHash('sha1')
      .update(`${u.hostname.split('.').slice(-2).join('.')}${u.pathname}`)
      .digest('hex');
  } catch {
    return null;
  }
}

export function captionTokens(caption) {
  return new Set(
    (caption || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[@#][\p{L}\p{N}_]+/gu, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
