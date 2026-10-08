import { describe, it, expect } from 'vitest';
import { fallbackScore, band } from '../src/brain/scoring.js';

describe('scoring when the vision model is busy', () => {
  it('a post by / naming the brand is at least a close match, even with a weak visual match', () => {
    expect(fallbackScore({ clip: 24, caption: 100, byBrand: true })).toBe(67);
    expect(band(fallbackScore({ clip: 0, caption: 70, byBrand: true }))).toBe('close');
    expect(fallbackScore({ clip: 90, caption: 100, byBrand: true })).toBe(95);
  });
  it('without brand evidence, weak visuals and captions stay below the threshold', () => {
    expect(band(fallbackScore({ clip: 24, caption: 20, byBrand: false }))).toBe('below_threshold');
    expect(band(fallbackScore({ clip: 85, caption: 60, byBrand: false }))).toBe('exact');
  });
});
