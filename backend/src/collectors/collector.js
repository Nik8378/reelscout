import { logger } from '../logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, retries = 2) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) {
      const fatal = ['NO_TOKEN', 'AUTH', 'NO_CREDIT', 'NO_ACTOR'].includes(err.code);
      if (fatal || i >= retries) throw err;
      await sleep(1500 * 2 ** i);
    }
  }
}

const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`), { code: 'TIMEOUT' })), ms)),
]);

/**
 * Keeps a cursor over one source's query ladder. fill(n) walks the ladder
 * (specific -> broad, then deeper pages) until n NEW videos were accepted or the ladder runs out.
 * `accept(video)` is the de-duplication gate (step 5) - it returns false for repeats.
 */
export class SourceCollector {
  constructor(source, ladder, { accept = () => true, onProgress = () => {} } = {}) {
    this.source = source;
    this.tasks = source.plan(ladder);
    this.i = 0;
    this.accept = accept;
    this.onProgress = onProgress;
    this.tried = [];
    this.errors = [];
    this.fatal = null;
  }

  get exhausted() { return this.fatal || this.i >= this.tasks.length; }

  async fill(n, { timeoutMs = 120000 } = {}) {
    const added = [];
    const deadline = Date.now() + timeoutMs;
    while (added.length < n && !this.exhausted && Date.now() < deadline) {
      const task = this.tasks[this.i++];
      const limit = Math.min(50, Math.max(15, Math.ceil((n - added.length) * 1.6)));
      this.tried.push(task.label);
      this.onProgress({ source: this.source.name, status: 'query', query: task.label, count: added.length, need: n });
      try {
        const items = await withTimeout(withRetry(() => this.source.run(task, limit)), Math.max(5000, deadline - Date.now()), this.source.label);
        let fresh = 0;
        for (const v of items) {
          if (added.length >= n * 2) break;
          if (this.accept(v)) { added.push({ ...v, query: task.label }); fresh++; }
        }
        logger.info({ source: this.source.name, query: task.label, raw: items.length, fresh }, 'collector step');
      } catch (err) {
        this.errors.push({ query: task.label, code: err.code || 'ERROR', message: err.message });
        logger.warn({ source: this.source.name, query: task.label, err: err.message }, 'collector step failed');
        if (['NO_TOKEN', 'AUTH', 'NO_CREDIT'].includes(err.code)) this.fatal = err;
      }
      this.onProgress({ source: this.source.name, status: 'progress', count: added.length, need: n });
    }
    return added;
  }
}
