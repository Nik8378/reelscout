import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setRunner } from '../src/pipeline/jobs.js';
import { saveResults } from '../src/pipeline/store.js';

const app = createApp();

beforeAll(() => {
  // fake pipeline: emits progress and saves two videos
  setRunner(async ({ searchId, emit }) => {
    emit('stage', { stage: 'fetching_page', status: 'done' });
    saveResults(searchId, [
      {
        key: `instagram:${searchId}`,
        platform: 'instagram',
        nativeId: searchId,
        url: 'https://instagram.com/reel/x',
        caption: '=cmd "quoted", text',
        score: 88,
        reason: 'same print',
        band: 'exact',
      },
      {
        key: `meta:${searchId}`,
        platform: 'meta',
        nativeId: searchId,
        url: 'https://facebook.com/ads/library/?id=1',
        caption: 'ad',
        score: 30,
        reason: 'different',
        band: 'below_threshold',
      },
    ]);
    emit('done', {});
  });
});

describe('API', () => {
  it('validates input', async () => {
    const r = await request(app).post('/api/search').send({ q: 'a' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_INPUT');
  });

  it('blocks unsafe product links before queueing', async () => {
    const r = await request(app).post('/api/search').send({ q: 'http://169.254.169.254/latest/meta-data' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('UNSAFE_URL');
  });

  it('runs a search in the background, streams progress, returns results, history and CSV', async () => {
    const r = await request(app)
      .post('/api/search')
      .send({ q: 'oversized graphic tee', options: { tiktok: false } });
    expect(r.status).toBe(202);
    const { id } = r.body;

    const stream = await request(app)
      .get(`/api/search/${id}/stream`)
      .buffer(true)
      .parse((res, cb) => {
        let d = '';
        res.on('data', (c) => {
          d += c;
        });
        res.on('end', () => cb(null, d));
      });
    expect(stream.body).toContain('event: stage');
    expect(stream.body).toContain('event: done');

    const s = await request(app).get(`/api/search/${id}`);
    expect(s.body.videos).toHaveLength(2);
    expect(s.body.videos[0].score).toBe(88);

    const h = await request(app).get('/api/history');
    expect(h.body.find((x) => x.id === id).counts).toEqual({ instagram: 1, meta: 0, tiktok: 0 });

    const csv = await request(app).get(`/api/search/${id}/export.csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(`"'=cmd ""quoted"", text"`); // escaped + formula-safe
    expect(csv.text).not.toContain('different'); // below-threshold excluded

    const add = await request(app)
      .post('/api/shortlist')
      .send({ videoId: `instagram:${id}`, searchId: id });
    expect(add.status).toBe(201);
    const list = await request(app).get('/api/shortlist');
    expect(list.body.some((v) => v.id === `instagram:${id}`)).toBe(true);
    await request(app)
      .delete(`/api/shortlist/${encodeURIComponent(`instagram:${id}`)}`)
      .expect(200);
  });

  it('returns clear 404s', async () => {
    expect((await request(app).get('/api/search/not-an-id')).status).toBe(404);
    expect((await request(app).get('/api/nope')).body.error.code).toBe('NOT_FOUND');
  });
});
