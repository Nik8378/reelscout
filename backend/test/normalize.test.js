import { describe, it, expect } from 'vitest';
import { normInstagram, normMeta, normTikTok } from '../src/collectors/normalize.js';
import { extractAdNodes } from '../src/collectors/metaBrowser.js';
import { instagram, meta } from '../src/collectors/sources.js';

describe('normalizers', () => {
  it('keeps Instagram videos and drops images', () => {
    expect(normInstagram({ type: 'Image', shortCode: 'a' })).toBeNull();
    const v = normInstagram({ type: 'Video', shortCode: 'C1x', displayUrl: 'https://cdn/t.jpg', videoUrl: 'https://cdn/v.mp4', caption: 'Hi  there', ownerUsername: 'me', timestamp: '2026-10-01T10:00:00.000Z' });
    expect(v).toMatchObject({ platform: 'instagram', nativeId: 'C1x', url: 'https://www.instagram.com/reel/C1x/', caption: 'Hi there' });
  });
  it('maps a Meta ad with video and skips image-only ads', () => {
    expect(normMeta({ ad_archive_id: '1', snapshot: { images: [{}] } })).toBeNull();
    const v = normMeta({ ad_archive_id: '123', collation_id: '9', page_name: 'Brand', start_date: 1727740800, snapshot: { body: { text: 'Shop {{product.name}} now' }, videos: [{ video_preview_image_url: 'https://fb/t.jpg', video_hd_url: 'https://fb/v.mp4' }] } });
    expect(v).toMatchObject({ platform: 'meta', nativeId: '123', groupId: '9', author: 'Brand', thumbnail: 'https://fb/t.jpg', postedAt: 1727740800000 });
    expect(v.caption).toBe('Shop  now');
  });
  it('maps TikTok items', () => {
    const v = normTikTok({ id: '77', text: 'fit check', webVideoUrl: 'https://www.tiktok.com/@a/video/77', videoMeta: { coverUrl: 'https://tt/c.jpg' }, authorMeta: { name: 'a' }, createTimeISO: '2026-10-02T00:00:00Z' });
    expect(v).toMatchObject({ platform: 'tiktok', nativeId: '77', thumbnail: 'https://tt/c.jpg' });
  });
  it('finds ad nodes anywhere inside Facebook JSON', () => {
    const json = { data: { a: { edges: [{ node: { collated_results: [{ ad_archive_id: '5', snapshot: {} }] } }] } } };
    expect(extractAdNodes(json).map((n) => n.ad_archive_id)).toEqual(['5']);
  });
});

describe('query plans', () => {
  it('instagram turns keywords into hashtags, specific first, no duplicates', () => {
    const tasks = instagram.plan({ keywords: ['Skull Tee'], hashtags: ['skulltee', 'graphictee'] });
    expect(tasks.flatMap((t) => t.tags)).toEqual(['skulltee', 'graphictee']);
  });
  it('meta searches keywords in ladder order', () => {
    expect(meta.plan({ keywords: ['a b', 'c'], hashtags: [] }).map((t) => t.query)).toEqual(['a b', 'c']);
  });
});
