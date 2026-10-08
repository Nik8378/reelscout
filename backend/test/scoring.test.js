import { describe, it, expect } from 'vitest';
import { clipToScore, blendScore, band } from '../src/brain/scoring.js';
import { fallbackAnalysis, queryLadder } from '../src/brain/analyze.js';

describe('scoring', () => {
  it('maps CLIP cosine to 0-100 and clamps', () => {
    expect(clipToScore(0.92)).toBe(100);
    expect(clipToScore(0.40)).toBe(0);
    expect(clipToScore(0.69)).toBe(50);
    expect(clipToScore(0.33, 'text')).toBe(100);
  });
  it('blends with the vision model weighted higher', () => {
    expect(blendScore({ clip: 80, llm: 100 })).toBe(93);
    expect(blendScore({ clip: 70, llm: null })).toBe(70);
    expect(blendScore({ clip: null, llm: 40 })).toBe(40);
  });
  it('a same-category but different design stays below the show threshold', () => {
    expect(band(blendScore({ clip: 70, llm: 30 }))).toBe('below_threshold');
    expect(band(blendScore({ clip: 85, llm: 92 }))).toBe('exact');
    expect(band(blendScore({ clip: 60, llm: 60 }))).toBe('close');
  });
});

describe('query ladder', () => {
  it('builds specific-to-broad queries without duplicates, even without Gemini', () => {
    const product = { inputType: 'keyword', title: 'Protein Dark Chocolate', brand: null };
    const ladder = queryLadder(fallbackAnalysis(product), product);
    expect(ladder.keywords[0]).toBe('Protein Dark Chocolate');
    expect(new Set(ladder.keywords.map((k) => k.toLowerCase())).size).toBe(ladder.keywords.length);
    expect(ladder.hashtags).toContain('proteindarkchocolate');
  });
});
