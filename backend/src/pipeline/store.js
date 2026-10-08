import crypto from 'node:crypto';
import { db } from '../db.js';

export function createSearch({ inputType, input, options }) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO searches (id, input_type, input, options_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    inputType,
    input,
    JSON.stringify(options || {}),
    'queued',
    Date.now(),
  );
  return id;
}

export function updateSearch(id, fields) {
  const cols = Object.keys(fields);
  db.prepare(`UPDATE searches SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
}

const upsertVideo = db.prepare(`
  INSERT INTO videos (id, platform, native_id, group_id, url, thumbnail, media_url, media_hash, phash, caption, author, posted_at, raw_json, first_search_id, created_at)
  VALUES (@id, @platform, @native_id, @group_id, @url, @thumbnail, @media_url, @media_hash, @phash, @caption, @author, @posted_at, @raw_json, @first_search_id, @created_at)
  ON CONFLICT(id) DO UPDATE SET thumbnail = COALESCE(excluded.thumbnail, thumbnail), phash = COALESCE(excluded.phash, phash), media_url = COALESCE(excluded.media_url, media_url)`);

const insertResult = db.prepare(`
  INSERT OR REPLACE INTO search_results (search_id, video_id, score, clip_score, llm_score, reason, checks_json, status)
  VALUES (@search_id, @video_id, @score, @clip_score, @llm_score, @reason, @checks_json, @status)`);

export const saveResults = db.transaction((searchId, videos) => {
  for (const v of videos) {
    upsertVideo.run({
      id: v.key,
      platform: v.platform,
      native_id: v.nativeId,
      group_id: v.groupId || null,
      url: v.url,
      thumbnail: v.thumbPath || v.thumbnail || null,
      media_url: v.mediaUrl || null,
      media_hash: v.mediaHash || null,
      phash: v.phash || null,
      caption: v.caption || '',
      author: v.author || null,
      posted_at: v.postedAt || null,
      raw_json: JSON.stringify({ query: v.query }),
      first_search_id: searchId,
      created_at: Date.now(),
    });
    insertResult.run({
      search_id: searchId,
      video_id: v.key,
      score: v.score,
      clip_score: v.clipScore ?? null,
      llm_score: v.llmScore ?? null,
      reason: v.reason || null,
      checks_json: v.checks ? JSON.stringify(v.checks) : null,
      status: v.previouslySeen ? 'previously_seen' : v.band === 'below_threshold' ? 'below_threshold' : 'shown',
    });
  }
});

/** Re-attach videos met again in this search with the score they got before (status previously_seen, max 30 per source) */
export const saveSeen = db.transaction((searchId, items, cap = 30) => {
  const prev = db.prepare(`SELECT score, clip_score, llm_score, reason, checks_json FROM search_results
    WHERE video_id = ? AND status != 'previously_seen' ORDER BY rowid DESC LIMIT 1`);
  const exists = db.prepare('SELECT 1 FROM search_results WHERE search_id = ? AND video_id = ?');
  const perSource = {};
  for (const it of items) {
    perSource[it.platform] = (perSource[it.platform] || 0) + 1;
    if (perSource[it.platform] > cap || exists.get(searchId, it.key)) continue;
    const p = prev.get(it.key);
    if (!p) continue;
    insertResult.run({
      search_id: searchId,
      video_id: it.key,
      score: p.score,
      clip_score: p.clip_score,
      llm_score: p.llm_score,
      reason: p.reason,
      checks_json: p.checks_json,
      status: 'previously_seen',
    });
  }
});

export function getSearch(id) {
  const s = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
  if (!s) return null;
  const rows = db
    .prepare(
      `
    SELECT r.*, v.platform, v.native_id, v.url, v.thumbnail, v.media_url, v.caption, v.author, v.posted_at, v.raw_json
    FROM search_results r JOIN videos v ON v.id = r.video_id WHERE r.search_id = ? ORDER BY r.score DESC`,
    )
    .all(id);
  return {
    id: s.id,
    inputType: s.input_type,
    input: s.input,
    status: s.status,
    error: s.error,
    createdAt: s.created_at,
    finishedAt: s.finished_at,
    options: JSON.parse(s.options_json || '{}'),
    product: s.product_json ? JSON.parse(s.product_json) : null,
    sources: s.sources_json ? JSON.parse(s.sources_json) : {},
    videos: rows.map((r) => ({
      id: r.video_id,
      platform: r.platform,
      url: r.url,
      thumbnail: r.thumbnail,
      mediaUrl: r.media_url,
      caption: r.caption,
      author: r.author,
      postedAt: r.posted_at,
      score: r.score,
      clipScore: r.clip_score,
      llmScore: r.llm_score,
      reason: r.reason,
      checks: r.checks_json ? JSON.parse(r.checks_json) : null,
      status: r.status,
      query: JSON.parse(r.raw_json || '{}').query || null,
    })),
  };
}
