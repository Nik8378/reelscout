// Pure mappers: raw provider items -> one common video shape. Return null for non-video items.
const ts = (v) => {
  if (!v) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};
const text = (v) => (typeof v === 'string' ? v : v?.text || '').replace(/\s+/g, ' ').trim();

export function normInstagram(it) {
  if (!it || it.error) return null;
  const isVideo = it.type === 'Video' || it.productType === 'clips' || it.isVideo || Boolean(it.videoUrl);
  const code = it.shortCode || it.shortcode || it.code;
  if (!isVideo || !(code || it.id)) return null;
  return {
    platform: 'instagram',
    nativeId: String(code || it.id),
    groupId: null,
    url: it.url || `https://www.instagram.com/reel/${code}/`,
    thumbnail: it.displayUrl || it.thumbnailUrl || it.thumbnail_url || it.images?.[0] || null,
    mediaUrl: it.videoUrl || it.video_url || null,
    caption: text(it.caption).slice(0, 2000),
    author: it.ownerUsername || it.owner?.username || null,
    postedAt: ts(it.timestamp || it.taken_at),
  };
}

/** Works for both the Apify Ad Library actor output and Facebook's own GraphQL nodes (same field names) */
export function normMeta(it) {
  if (!it) return null;
  const id = it.ad_archive_id || it.adArchiveID || it.adArchiveId || it.id;
  const snap = it.snapshot || it;
  const videos = [...(snap.videos || []), ...(snap.cards || []).filter((c) => c.video_preview_image_url || c.video_hd_url || c.video_sd_url)];
  const v = videos.find((x) => x.video_preview_image_url || x.video_hd_url || x.video_sd_url);
  if (!id || !v) return null;
  const body = text(snap.body?.text ?? snap.body) || text(snap.body?.markup?.__html) || text(snap.cards?.[0]?.body) || '';
  return {
    platform: 'meta',
    nativeId: String(id),
    groupId: it.collation_id || it.collationID || null,
    url: `https://www.facebook.com/ads/library/?id=${id}`,
    thumbnail: v.video_preview_image_url || null,
    mediaUrl: v.video_hd_url || v.video_sd_url || null,
    caption: [snap.title, body].filter(Boolean).join(' - ').replace(/\{\{[^}]+\}\}/g, '').slice(0, 2000),
    author: it.page_name || snap.page_name || null,
    postedAt: ts(it.start_date || it.startDate),
  };
}

export function normTikTok(it) {
  if (!it || !it.id || it.error) return null;
  return {
    platform: 'tiktok',
    nativeId: String(it.id),
    groupId: null,
    url: it.webVideoUrl || `https://www.tiktok.com/@${it.authorMeta?.name || 'user'}/video/${it.id}`,
    thumbnail: it.videoMeta?.coverUrl || it.videoMeta?.originalCoverUrl || it.covers?.default || null,
    mediaUrl: null,
    caption: text(it.text).slice(0, 2000),
    author: it.authorMeta?.name || null,
    postedAt: ts(it.createTimeISO || it.createTime),
  };
}
