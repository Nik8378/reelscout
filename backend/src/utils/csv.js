const esc = (v) => {
  const s = v == null ? '' : String(v);
  // prevent spreadsheet formula injection from captions
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(videos, searchInput = '') {
  const head = ['platform', 'match_score', 'match_reason', 'video_url', 'author', 'posted_at', 'caption_or_ad_copy', 'search'];
  const lines = videos.map((v) => [
    v.platform, v.score, v.reason, v.url, v.author, v.postedAt ? new Date(v.postedAt).toISOString().slice(0, 10) : '',
    (v.caption || '').slice(0, 500), v.searchInput || searchInput,
  ].map(esc).join(','));
  return `${head.join(',')}\n${lines.join('\n')}\n`;
}
