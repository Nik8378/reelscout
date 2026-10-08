async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error?.message || `Request failed (HTTP ${res.status})`);
    err.hint = body.error?.hint;
    err.code = body.error?.code;
    throw err;
  }
  return body;
}
const post = (url, data) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

export const api = {
  health: () => fetch('/api/health').then(json),
  search: (payload) => post('/api/search', payload).then(json),
  getSearch: (id) => fetch(`/api/search/${id}`).then(json),
  history: () => fetch('/api/history').then(json),
  shortlist: () => fetch('/api/shortlist').then(json),
  addShortlist: (videoId, searchId) => post('/api/shortlist', { videoId, searchId }).then(json),
  removeShortlist: (videoId) => fetch(`/api/shortlist/${encodeURIComponent(videoId)}`, { method: 'DELETE' }).then(json),
  streamUrl: (id) => `/api/search/${id}/stream`,
};

export const isUrl = (q) => /^https?:\/\//i.test(q.trim()) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(q.trim());

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the image'));
    r.readAsDataURL(file);
  });
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const band = (score) => (score >= 70 ? 'exact' : score >= 50 ? 'close' : 'low');
export const PLATFORM = { instagram: 'Instagram Reel', meta: 'Meta ad', tiktok: 'TikTok' };
