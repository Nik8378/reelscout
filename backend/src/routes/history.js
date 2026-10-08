import { Router } from 'express';
import { db } from '../db.js';
import { getSearch } from '../pipeline/store.js';
import { AppError } from '../utils/errors.js';
import { toCsv } from '../utils/csv.js';

export const historyRouter = Router();
export const shortlistRouter = Router();

// GET /api/history?limit=30  -> earlier searches with per-source counts
historyRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const rows = db
    .prepare(
      `
    SELECT s.id, s.input, s.input_type, s.status, s.created_at, s.finished_at, s.product_json, s.error,
      SUM(CASE WHEN r.status = 'shown' AND v.platform = 'instagram' THEN 1 ELSE 0 END) AS instagram,
      SUM(CASE WHEN r.status = 'shown' AND v.platform = 'meta' THEN 1 ELSE 0 END) AS meta,
      SUM(CASE WHEN r.status = 'shown' AND v.platform = 'tiktok' THEN 1 ELSE 0 END) AS tiktok
    FROM searches s
    LEFT JOIN search_results r ON r.search_id = s.id
    LEFT JOIN videos v ON v.id = r.video_id
    GROUP BY s.id ORDER BY s.created_at DESC LIMIT ?`,
    )
    .all(limit);
  res.json(
    rows.map((r) => {
      const p = r.product_json ? JSON.parse(r.product_json) : {};
      return {
        id: r.id,
        input: r.input,
        inputType: r.input_type,
        status: r.status,
        error: r.error,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
        title: p.title || r.input,
        image: p.imagePath || null,
        counts: { instagram: r.instagram || 0, meta: r.meta || 0, tiktok: r.tiktok || 0 },
      };
    }),
  );
});

const listShortlist = () =>
  db
    .prepare(
      `
  SELECT sl.video_id, sl.search_id, sl.created_at, v.platform, v.url, v.thumbnail, v.caption, v.author, v.posted_at,
         r.score, r.reason, s.input AS search_input
  FROM shortlist sl JOIN videos v ON v.id = sl.video_id
  LEFT JOIN search_results r ON r.video_id = sl.video_id AND r.search_id = sl.search_id
  LEFT JOIN searches s ON s.id = sl.search_id
  ORDER BY sl.created_at DESC`,
    )
    .all()
    .map((r) => ({
      id: r.video_id,
      searchId: r.search_id,
      platform: r.platform,
      url: r.url,
      thumbnail: r.thumbnail,
      caption: r.caption,
      author: r.author,
      postedAt: r.posted_at,
      score: r.score,
      reason: r.reason,
      searchInput: r.search_input,
      savedAt: r.created_at,
    }));

shortlistRouter.get('/', (req, res) => res.json(listShortlist()));

shortlistRouter.post('/', (req, res, next) => {
  const { videoId, searchId } = req.body || {};
  if (typeof videoId !== 'string' || !db.prepare('SELECT 1 FROM videos WHERE id = ?').get(videoId)) {
    return next(new AppError('NOT_FOUND', 'Video not found', 404));
  }
  db.prepare('INSERT OR REPLACE INTO shortlist (video_id, search_id, created_at) VALUES (?, ?, ?)').run(
    videoId,
    typeof searchId === 'string' ? searchId : null,
    Date.now(),
  );
  res.status(201).json({ ok: true, count: db.prepare('SELECT COUNT(*) AS n FROM shortlist').get().n });
});

shortlistRouter.delete('/:videoId', (req, res) => {
  db.prepare('DELETE FROM shortlist WHERE video_id = ?').run(req.params.videoId);
  res.json({ ok: true, count: db.prepare('SELECT COUNT(*) AS n FROM shortlist').get().n });
});

shortlistRouter.get('/export.csv', (req, res) => {
  res.attachment('reelscout-shortlist.csv').type('text/csv').send(toCsv(listShortlist()));
});

export { getSearch };
