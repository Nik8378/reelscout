import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { runSearch } from '../src/pipeline/runSearch.js';
import { createSearch, getSearch } from '../src/pipeline/store.js';
import { band } from '../src/brain/scoring.js';

const thumb = async (i) => `data:image/png;base64,${(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#${((i + 1) * 2654435).toString(16).slice(-6)}"/><circle cx="${(i * 37) % 100 + 10}" cy="${(i * 53) % 100 + 10}" r="${12 + (i % 20)}" fill="#fff"/><rect x="${(i * 71) % 80}" y="${(i * 29) % 80}" width="40" height="18" fill="#111"/><polygon points="0,120 ${(i * 17) % 110},${(i * 13) % 60} 70,120" fill="#c33"/></svg>`)).png().toBuffer()).toString('base64')}`;

const RUN = Date.now().toString(36);
function fakeSource(name, total, { optional = false, fail = false } = {}) {
  let n = 0;
  return {
    name, label: name, optional,
    plan: () => Array.from({ length: 6 }, (_, i) => ({ label: `q${i}` })),
    async run(task, limit) {
      if (fail) throw Object.assign(new Error('blocked'), { code: 'AUTH' });
      const out = [];
      for (let i = 0; i < limit && n < total; i++, n++) out.push({ platform: name, nativeId: `${RUN}${name}${n}`, url: `https://x/${n}`, thumbnail: await thumb(n + name.length * 100), caption: `video ${n}`, mediaUrl: null });
      return out;
    },
  };
}
// every 4th video is a poor match
const scorer = async ({ candidates }) => new Map(candidates.map((c, i) => { const s = i % 4 === 3 ? 30 : 85; return [c.id, { score: s, reason: 'test', band: band(s) }]; }));
const analysis = { engine: 'test', queries: { exact: ['a'], descriptive: [], broad: [], hashtags: [] } };

describe('runSearch pipeline (offline)', () => {
  it('meets 20 per required source, keeps going when one source fails, and never repeats videos', async () => {
    const sources = { instagram: fakeSource('instagram', 80), meta: fakeSource('meta', 80), tiktok: fakeSource('tiktok', 5, { optional: true, fail: true }) };
    const input = { type: 'keyword', value: 'test product', options: { tiktok: true } };
    const id1 = createSearch({ inputType: 'keyword', input: 'test product' });
    const s1 = await runSearch({ searchId: id1, input, deps: { sources, scorer, analysis } });
    expect(s1.instagram.shown).toBeGreaterThanOrEqual(20);
    expect(s1.meta.shown).toBeGreaterThanOrEqual(20);
    expect(s1.tiktok.status).toBe('failed');
    const r1 = getSearch(id1);
    expect(r1.status).toBe('done');
    expect(new Set(r1.videos.map((v) => v.id)).size).toBe(r1.videos.length);

    // second search on the same sources: nothing from search 1 may come back
    const id2 = createSearch({ inputType: 'keyword', input: 'test product' });
    const sources2 = { instagram: fakeSource('instagram', 120), meta: fakeSource('meta', 120) };
    await runSearch({ searchId: id2, input: { ...input, options: {} }, deps: { sources: sources2, scorer, analysis } });
    const first = new Set(r1.videos.map((v) => v.id));
    expect(getSearch(id2).videos.some((v) => first.has(v.id))).toBe(false);
  }, 30000);
});
