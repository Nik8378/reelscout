import { describe, it, expect } from 'vitest';
import { cleanTitle, fallbackAnalysis, queryLadder } from '../src/brain/analyze.js';

describe('keyword fallback on messy marketplace titles', () => {
  const product = { inputType: 'url', brand: 'RiteBite Max Protein', title: 'RiteBite Max Protein RiteBite Max Protein Ultimate Choco Almond 30gm Protein Bar (Pack of 1)' };
  it('cleans sizes, pack counts and brackets', () => {
    expect(cleanTitle(product.title)).toBe('RiteBite Max Protein RiteBite Max Protein Ultimate Choco Almond Protein Bar');
  });
  it('builds brand-first, readable queries and short hashtags', () => {
    const ladder = queryLadder(fallbackAnalysis(product), product);
    expect(ladder.keywords).toContain('RiteBite Max Protein Ultimate Choco Almond Protein Bar');
    expect(ladder.keywords).toContain('RiteBite Max Protein protein bar');
    expect(ladder.keywords).toContain('RiteBite Max Protein');
    expect(ladder.keywords).toContain('ultimate choco almond protein bar');
    expect(ladder.keywords.some((k) => k.includes('(pack'))).toBe(false);
    expect(ladder.hashtags).toContain('ritebite');
    expect(ladder.hashtags).toContain('proteinbar');
    expect(ladder.hashtags.every((h) => h.length <= 30)).toBe(true);
  });
});
