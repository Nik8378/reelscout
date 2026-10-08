import { resolveProduct } from '../services/productResolver.js';
import { analyzeProduct, queryLadder } from '../brain/analyze.js';
import { scoreCandidates } from '../brain/verify.js';
import { SOURCES } from '../collectors/sources.js';
import { SourceCollector } from '../collectors/collector.js';
import { DedupGate } from '../dedup/gate.js';
import { attachThumbnails } from '../dedup/thumbs.js';
import { updateSearch, saveResults } from './store.js';
import { band } from '../brain/scoring.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_ROUNDS = 3;

/**
 * One search = resolve product -> analyse image -> (Instagram || Meta || TikTok in parallel:
 * collect -> dedup -> thumbnails -> near-dup -> score -> repeat with wider queries until 20 shown) -> save.
 * deps are injectable so the whole pipeline can be tested offline.
 */
export async function runSearch({ searchId, input, emit = () => {}, deps = {} }) {
  const sources = deps.sources || SOURCES;
  const scorer = deps.scorer || scoreCandidates;
  const MIN = config.MIN_PER_SOURCE;
  const started = Date.now();
  updateSearch(searchId, { status: 'running' });

  try {
    emit('stage', { stage: 'fetching_page', status: 'running' });
    const product = await resolveProduct({ type: input.type, value: input.value, image: input.image });
    emit('stage', { stage: 'fetching_page', status: 'done', detail: product.cached ? 'cached' : product.source });

    emit('stage', { stage: 'analysing_image', status: 'running' });
    const analysis = deps.analysis || await analyzeProduct(product);
    const ladder = queryLadder(analysis, product);
    product.analysis = analysis;
    updateSearch(searchId, { product_json: JSON.stringify(product) });
    emit('product', product);
    emit('stage', { stage: 'analysing_image', status: 'done', detail: analysis.engine === 'gemini' ? `${(analysis.distinctiveFeatures || []).length} distinctive features` : 'keyword fallback' });

    const gate = new DedupGate({ searchId, includeSeen: Boolean(input.options?.includeSeen) });
    const wantTikTok = input.options?.tiktok ?? config.ENABLE_TIKTOK;
    const active = Object.values(sources).filter((s) => !s.optional || (s.name === 'tiktok' && wantTikTok));
    const report = {};

    const runSource = async (source) => {
      const r = report[source.name] = { label: source.label, required: !source.optional, need: source.optional ? 0 : MIN, shown: 0, below: 0, seen: 0, rounds: 0, status: 'running', tried: [], errors: [] };
      emit('stage', { stage: `searching_${source.name}`, status: 'running' });
      const collector = new SourceCollector(source, ladder, {
        accept: gate.accept,
        onProgress: (p) => emit('source', { source: source.name, ...p, shown: r.shown, need: MIN }),
      });
      const target = source.optional ? 15 : MIN;
      const deadline = started + config.SOURCE_TIMEOUT_MS * 2.5;

      while (r.shown < target && !collector.exhausted && r.rounds < MAX_ROUNDS && Date.now() < deadline) {
        r.rounds++;
        const want = Math.ceil((target - r.shown) * (r.rounds === 1 ? 1.4 : 1.8));
        let batch = await collector.fill(want, { timeoutMs: Math.max(10000, deadline - Date.now()) });
        if (!batch.length) continue;
        await attachThumbnails(batch);
        batch = batch.filter((v) => !gate.isNearDuplicate(v));

        emit('stage', { stage: 'scoring', status: 'running', detail: `${source.label}: ${batch.length} videos` });
        const scores = await scorer({ product, analysis, candidates: batch.map((v) => ({ id: v.key, thumbBuf: v.thumbBuf, caption: v.caption })) });
        for (const v of batch) {
          Object.assign(v, scores.get(v.key) || { score: 0, reason: 'Not scored' });
          v.band = v.band || band(v.score);
          delete v.thumbBuf;
          if (v.previouslySeen) r.seen++;
          else if (v.band === 'below_threshold') r.below++;
          else r.shown++;
        }
        saveResults(searchId, batch);
        emit('results', { source: source.name, count: batch.length, shown: r.shown, need: target });
        emit('source', { source: source.name, status: 'progress', shown: r.shown, need: MIN });
      }

      r.tried = collector.tried;
      r.errors = collector.errors;
      r.status = collector.fatal && r.shown === 0 ? 'failed' : r.shown >= target ? 'ok' : 'shortfall';
      if (r.status === 'shortfall') {
        r.message = `Found ${r.shown} of ${target} matching videos after ${r.tried.length} queries (${r.below} more below the match threshold).`
          + (collector.fatal ? ` Stopped: ${collector.fatal.message}.` : collector.exhausted ? ' All query variations were tried.' : ' Time limit reached.');
      }
      if (r.status === 'failed') r.message = collector.fatal.message;
      emit('stage', { stage: `searching_${source.name}`, status: r.status === 'ok' ? 'done' : r.status, detail: `${r.shown}/${target}` });
    };

    await Promise.allSettled(active.map((s) => runSource(s).catch((err) => {
      logger.error({ err, source: s.name }, 'source crashed');
      Object.assign(report[s.name], { status: 'failed', message: err.message });
    })));

    const summary = { ...report, dedup: gate.stats, ms: Date.now() - started };
    const anyRequiredOk = active.some((s) => !s.optional && report[s.name].shown > 0);
    updateSearch(searchId, {
      status: anyRequiredOk ? 'done' : 'failed',
      sources_json: JSON.stringify(summary),
      finished_at: Date.now(),
      error: anyRequiredOk ? null : 'No source returned matching videos. See per-source messages.',
    });
    emit('stage', { stage: 'scoring', status: 'done' });
    emit('done', { sources: summary });
    return summary;
  } catch (err) {
    logger.error({ err: err.message }, 'search failed');
    updateSearch(searchId, { status: 'failed', error: err.message, finished_at: Date.now() });
    emit('error', { code: err.code || 'SEARCH_FAILED', message: err.message, hint: err.hint });
    return null;
  }
}
