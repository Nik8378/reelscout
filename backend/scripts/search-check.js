// Usage: npm run search -- "<product url or name>" [--tiktok] [--seen]
import { classifyInput } from '../src/schemas.js';
import { createSearch, getSearch } from '../src/pipeline/store.js';
import { runSearch } from '../src/pipeline/runSearch.js';

const args = process.argv.slice(2);
const q = args.find((a) => !a.startsWith('--'));
if (!q) {
  console.log('Usage: npm run search -- "<url or name>" [--tiktok] [--seen]');
  process.exit(1);
}
const options = { tiktok: args.includes('--tiktok'), includeSeen: args.includes('--seen') };
const input = { ...classifyInput(q), options };
const searchId = createSearch({ inputType: input.type, input: q, options });

await runSearch({
  searchId,
  input,
  emit: (type, data) => {
    if (type === 'stage') console.log(`[stage] ${data.stage} ${data.status}${data.detail ? ` - ${data.detail}` : ''}`);
    if (type === 'source' && data.status === 'query') console.log(`  [${data.source}] trying ${data.query}`);
    if (type === 'error') console.log('[error]', data);
  },
});
const s = getSearch(searchId);
const by = (p, st) => s.videos.filter((v) => v.platform === p && (!st || v.status === st)).length;
console.log('\nRESULT', { status: s.status, error: s.error });
for (const p of ['instagram', 'meta', 'tiktok'])
  console.log(
    ` ${p}: shown ${by(p, 'shown')}, below threshold ${by(p, 'below_threshold')}, previously seen ${by(p, 'previously_seen')}`,
  );
console.log(' dedup:', s.sources.dedup);
for (const [k, r] of Object.entries(s.sources)) if (r?.message) console.log(` ${k}: ${r.message}`);
console.log(
  '\nTop 3:',
  s.videos.slice(0, 3).map((v) => `${v.score} ${v.platform} ${v.reason} ${v.url}`),
);
process.exit(0);
