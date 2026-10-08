import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { dHash, hamming, mediaHash, captionTokens, jaccard } from '../src/dedup/hash.js';
import { DedupGate } from '../src/dedup/gate.js';

const emptyHistory = () => ({ ids: new Set(), groups: new Set(), media: new Set(), phashes: [] });
// realistic test 'thumbnails': a few shapes whose layout depends on the seed
const pattern = (seed) =>
  sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="#${(seed * 1234567).toString(16).slice(0, 6).padEnd(6, '3')}"/>
  <circle cx="${((seed * 37) % 160) + 20}" cy="${((seed * 53) % 160) + 20}" r="40" fill="#fff"/>
  <rect x="${(seed * 71) % 120}" y="${(seed * 29) % 120}" width="70" height="30" fill="#111"/>
  <polygon points="10,190 ${((seed * 17) % 180) + 10},${((seed * 13) % 100) + 10} 120,190" fill="#c33"/></svg>`),
  )
    .png()
    .toBuffer();

describe('perceptual hash', () => {
  it('re-encoded / resized copy is a near-duplicate, different image is not', async () => {
    const a = await pattern(7);
    const resized = await sharp(a).resize(100, 100).jpeg({ quality: 70 }).toBuffer();
    const other = await pattern(13);
    expect(hamming(await dHash(a), await dHash(resized))).toBeLessThanOrEqual(8);
    expect(hamming(await dHash(a), await dHash(other))).toBeGreaterThan(12);
  });
  it('detects mirrored re-uploads via the flipped hash', async () => {
    const a = await pattern(7);
    const mirrored = await sharp(a).flop().png().toBuffer();
    expect(hamming(await dHash(mirrored, { flip: true }), await dHash(a))).toBeLessThanOrEqual(2);
  });
  it('media hash ignores signed query strings', () => {
    expect(mediaHash('https://scontent-a.cdninstagram.com/v/abc.mp4?oe=1&sig=x')).toBe(
      mediaHash('https://scontent-b.cdninstagram.com/v/abc.mp4?oe=2'),
    );
  });
  it('caption overlap catches reposts', () => {
    expect(
      jaccard(
        captionTokens('Our new skull tee is back in stock #drop'),
        captionTokens('our NEW skull tee is back in stock!! #repost'),
      ),
    ).toBeGreaterThan(0.85);
  });
});

describe('DedupGate', () => {
  const v = (o) => ({ platform: 'meta', nativeId: '1', caption: '', ...o });
  it('drops same ID and same Meta ad group inside one search', () => {
    const g = new DedupGate({ history: emptyHistory() });
    expect(g.accept(v({ nativeId: '1', groupId: 'G' }))).toBe(true);
    expect(g.accept(v({ nativeId: '1' }))).toBe(false);
    expect(g.accept(v({ nativeId: '2', groupId: 'G' }))).toBe(false);
    expect(g.stats).toMatchObject({ sameId: 1, sameAdGroup: 1 });
  });
  it('hides videos from earlier searches unless "show previously seen" is on', () => {
    const history = { ...emptyHistory(), ids: new Set(['instagram:OLD']) };
    expect(new DedupGate({ history }).accept(v({ platform: 'instagram', nativeId: 'OLD' }))).toBe(false);
    const g = new DedupGate({ history, includeSeen: true });
    const old = v({ platform: 'instagram', nativeId: 'OLD' });
    expect(g.accept(old)).toBe(true);
    expect(old.previouslySeen).toBe(true);
  });
  it('drops near-duplicate thumbnails (re-uploads) inside one search', async () => {
    const g = new DedupGate({ history: emptyHistory() });
    const img = await pattern(5);
    const a = v({ nativeId: 'a', phash: await dHash(img), phashFlip: await dHash(img, { flip: true }) });
    const copy = await sharp(img).resize(50, 50).toBuffer();
    const b = v({ nativeId: 'b', phash: await dHash(copy), phashFlip: await dHash(copy, { flip: true }) });
    expect(g.isNearDuplicate(a)).toBe(false);
    expect(g.isNearDuplicate(b)).toBe(true);
  });
});
