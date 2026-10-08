import { db } from '../db.js';
import { hamming, mediaHash, captionTokens, jaccard } from './hash.js';

export const NEAR_DUP_BITS = 10;     // <= 10 of 64 bits differ = same frame. Measured: copies (resize, JPEG, 3% crop) <= 12 worst case, mostly <= 8, different images >= 24
export const CAPTION_DUP = 0.85;     // >= 85% caption word overlap = repost

/** Everything returned by earlier searches - used to keep every new search fresh */
export function loadHistory(searchId) {
  const rows = db.prepare(`
    SELECT DISTINCT v.id, v.platform, v.group_id, v.media_hash, v.phash
    FROM search_results r JOIN videos v ON v.id = r.video_id
    WHERE r.search_id != ? AND r.status != 'previously_seen'`).all(searchId || '');
  return {
    ids: new Set(rows.map((r) => r.id)),
    groups: new Set(rows.filter((r) => r.group_id).map((r) => `${r.platform}:${r.group_id}`)),
    media: new Set(rows.filter((r) => r.media_hash).map((r) => r.media_hash)),
    phashes: rows.filter((r) => r.phash).map((r) => r.phash),
  };
}

/**
 * Two-stage de-duplication.
 *  accept(v)  - cheap, before downloading anything: exact ID, Meta ad group (same ad under many IDs),
 *               media-file hash, and "already returned in an earlier search".
 *  isNearDuplicate(v) - after the thumbnail is downloaded: perceptual hash (also mirrored)
 *               and caption overlap, against this search and against history.
 */
export class DedupGate {
  constructor({ searchId, includeSeen = false, history } = {}) {
    this.history = history || loadHistory(searchId);
    this.includeSeen = includeSeen;
    this.ids = new Set();
    this.groups = new Set();
    this.media = new Set();
    this.kept = [];
    this.stats = { previouslySeen: 0, sameId: 0, sameAdGroup: 0, sameMediaFile: 0, nearDuplicate: 0, repostCaption: 0 };
    this.accept = this.accept.bind(this);
  }

  accept(v) {
    const key = `${v.platform}:${v.nativeId}`;
    const group = v.groupId ? `${v.platform}:${v.groupId}` : null;
    const mh = mediaHash(v.mediaUrl);
    if (this.ids.has(key)) { this.stats.sameId++; return false; }
    if (group && this.groups.has(group)) { this.stats.sameAdGroup++; return false; }
    if (mh && this.media.has(mh)) { this.stats.sameMediaFile++; return false; }
    const seen = this.history.ids.has(key) || (group && this.history.groups.has(group)) || (mh && this.history.media.has(mh));
    if (seen && !this.includeSeen) { this.stats.previouslySeen++; return false; }
    v.key = key;
    v.mediaHash = mh;
    v.previouslySeen = Boolean(seen);
    this.ids.add(key);
    if (group) this.groups.add(group);
    if (mh) this.media.add(mh);
    return true;
  }

  isNearDuplicate(v) {
    const tokens = captionTokens(v.caption);
    if (v.phash) {
      for (const k of this.kept) {
        if (Math.min(hamming(v.phash, k.phash), hamming(v.phashFlip, k.phash)) <= NEAR_DUP_BITS) { this.stats.nearDuplicate++; return true; }
      }
      if (!v.previouslySeen) {
        const old = this.history.phashes.find((h) => Math.min(hamming(v.phash, h), hamming(v.phashFlip, h)) <= NEAR_DUP_BITS - 1);
        if (old) {
          if (!this.includeSeen) { this.stats.previouslySeen++; return true; }
          v.previouslySeen = true;
        }
      }
    }
    if (tokens.size >= 6 && v.platform !== 'meta') {
      for (const k of this.kept) {
        if (k.platform === v.platform && jaccard(tokens, k.tokens) >= CAPTION_DUP) { this.stats.repostCaption++; return true; }
      }
    }
    this.kept.push({ phash: v.phash, platform: v.platform, tokens });
    return false;
  }
}
