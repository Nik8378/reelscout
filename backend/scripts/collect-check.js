// Usage: npm run collect -- "protein dark chocolate" [instagram|meta|tiktok]
import { SOURCES } from '../src/collectors/sources.js';
import { SourceCollector } from '../src/collectors/collector.js';

const [query, only] = process.argv.slice(2);
if (!query) { console.log('Usage: npm run collect -- "<keyword>" [instagram|meta|tiktok]'); process.exit(1); }
const words = query.toLowerCase().split(/\s+/);
const ladder = { keywords: [query, words.slice(-2).join(' ')], hashtags: [words.join(''), ...words.filter((w) => w.length > 3)] };

const names = only ? [only] : Object.keys(SOURCES);
const results = await Promise.allSettled(names.map(async (name) => {
  const seen = new Set();
  const c = new SourceCollector(SOURCES[name], ladder, { accept: (v) => (seen.has(v.nativeId) ? false : (seen.add(v.nativeId), true)) });
  const vids = await c.fill(20, { timeoutMs: 180000 });
  return { name, count: vids.length, tried: c.tried, errors: c.errors, sample: vids.slice(0, 2).map((v) => ({ url: v.url, thumb: Boolean(v.thumbnail), caption: v.caption.slice(0, 60) })) };
}));
for (const r of results) console.log(JSON.stringify(r.status === 'fulfilled' ? r.value : { error: r.reason.message }, null, 2));
process.exit(0);
