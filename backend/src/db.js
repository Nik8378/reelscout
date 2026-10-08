import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
export const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  input_type TEXT NOT NULL,          -- keyword | url | image
  input TEXT NOT NULL,
  options_json TEXT,
  product_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  sources_json TEXT,                 -- per-source counts, shortfalls, errors
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,               -- platform:nativeId
  platform TEXT NOT NULL,            -- instagram | meta | tiktok
  native_id TEXT NOT NULL,
  group_id TEXT,                     -- e.g. Meta collation_id (same ad, many IDs)
  url TEXT,
  thumbnail TEXT,
  media_url TEXT,
  media_hash TEXT,                   -- sha1 of media URL without query string
  phash TEXT,                        -- 64-bit dHash of thumbnail (hex)
  caption TEXT,
  author TEXT,
  posted_at INTEGER,
  raw_json TEXT,
  first_search_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_media_hash ON videos(media_hash);
CREATE INDEX IF NOT EXISTS idx_videos_group ON videos(group_id);

CREATE TABLE IF NOT EXISTS search_results (
  search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id),
  score INTEGER,
  clip_score INTEGER,
  llm_score INTEGER,
  reason TEXT,
  checks_json TEXT,
  status TEXT NOT NULL DEFAULT 'shown',  -- shown | below_threshold | previously_seen
  PRIMARY KEY (search_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_results_video ON search_results(video_id);

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shortlist (
  video_id TEXT PRIMARY KEY REFERENCES videos(id),
  search_id TEXT,
  created_at INTEGER NOT NULL
);
`);

export const cache = {
  get(key) {
    const row = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      db.prepare('DELETE FROM cache WHERE key = ?').run(key);
      return null;
    }
    return JSON.parse(row.value);
  },
  set(key, value, ttlMs = 7 * 24 * 3600 * 1000) {
    db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)').run(
      key,
      JSON.stringify(value),
      Date.now() + ttlMs,
    );
  },
};
