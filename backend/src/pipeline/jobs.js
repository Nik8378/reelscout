import PQueue from 'p-queue';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runSearch } from './runSearch.js';
import { db } from '../db.js';

/**
 * Background job queue: POST /api/search returns immediately, the pipeline runs here.
 * Each job keeps its event log so a browser that connects late (or reconnects) gets the full history.
 */
const queue = new PQueue({ concurrency: config.MAX_CONCURRENT_SEARCHES });
const jobs = new Map();
let runner = runSearch;

export const setRunner = (fn) => { runner = fn; }; // tests inject a fake pipeline
export const getJob = (id) => jobs.get(id);
export const queueStats = () => ({ running: queue.pending, waiting: queue.size });

// searches that were running when the server stopped can never finish - mark them clearly
db.prepare("UPDATE searches SET status = 'failed', error = 'Interrupted by a server restart - run the search again' WHERE status IN ('queued', 'running')").run();

export function enqueue(searchId, input) {
  const job = { events: [], bus: new EventEmitter(), done: false };
  job.bus.setMaxListeners(100);
  jobs.set(searchId, job);
  const emit = (type, data = {}) => {
    const ev = { type, data, at: Date.now() };
    job.events.push(ev);
    job.bus.emit('event', ev);
    if (type === 'done' || type === 'error') {
      job.done = true;
      setTimeout(() => jobs.delete(searchId), 15 * 60_000).unref();
    }
  };
  emit('queued', { position: queue.size + queue.pending + 1 });
  queue.add(async () => {
    try {
      await runner({ searchId, input, emit });
    } catch (err) {
      logger.error({ err, searchId }, 'job crashed');
      emit('error', { code: 'JOB_CRASHED', message: 'The search stopped unexpectedly.' });
    }
    if (!job.done) emit('done', {});
  });
  return job;
}
