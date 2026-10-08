import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchInput, classifyInput } from '../schemas.js';
import { createSearch, getSearch } from '../pipeline/store.js';
import { enqueue, getJob, queueStats } from '../pipeline/jobs.js';
import { assertSafeUrl } from '../utils/ssrf.js';
import { AppError } from '../utils/errors.js';
import { toCsv } from '../utils/csv.js';

export const searchRouter = Router();
const ID = /^[0-9a-f-]{36}$/;

const checkId = (req, res, next) => (ID.test(req.params.id) ? next() : next(new AppError('NOT_FOUND', 'Search not found', 404)));

// POST /api/search  { q, image?, options: { tiktok?, includeSeen? } }  -> 202 { id }
searchRouter.post(
  '/',
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    message: { error: { code: 'TOO_MANY_SEARCHES', message: 'Too many searches - wait a minute.' } },
  }),
  async (req, res, next) => {
    try {
      const body = searchInput.parse(req.body);
      const input = { ...classifyInput(body.q), image: body.image, options: body.options };
      if (input.type === 'url') await assertSafeUrl(input.value); // reject unsafe links before queueing
      const id = createSearch({
        inputType: input.type === 'keyword' && !input.value ? 'image' : input.type,
        input: input.value || '(image upload)',
        options: body.options,
      });
      enqueue(id, input);
      res.status(202).json({ id, status: 'queued', stream: `/api/search/${id}/stream`, queue: queueStats() });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/search/:id  -> full result set (all statuses; the UI filters)
searchRouter.get('/:id', checkId, (req, res, next) => {
  const s = getSearch(req.params.id);
  if (!s) return next(new AppError('NOT_FOUND', 'Search not found', 404));
  res.json(s);
});

// GET /api/search/:id/stream  -> Server-Sent Events with live pipeline progress
searchRouter.get('/:id/stream', checkId, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (ev) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  const job = getJob(req.params.id);
  if (!job) {
    const s = getSearch(req.params.id);
    send({
      type: s ? (s.status === 'failed' ? 'error' : 'done') : 'error',
      data: s ? { status: s.status, message: s.error } : { message: 'Search not found' },
    });
    return res.end();
  }
  job.events.forEach(send);
  if (job.done) return res.end();
  const onEvent = (ev) => {
    send(ev);
    if (ev.type === 'done' || ev.type === 'error') res.end();
  };
  job.bus.on('event', onEvent);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    job.bus.off('event', onEvent);
  });
});

// GET /api/search/:id/export.csv
searchRouter.get('/:id/export.csv', checkId, (req, res, next) => {
  const s = getSearch(req.params.id);
  if (!s) return next(new AppError('NOT_FOUND', 'Search not found', 404));
  const rows = s.videos.filter((v) => req.query.all === '1' || v.status === 'shown');
  res
    .attachment(`reelscout-${s.id.slice(0, 8)}.csv`)
    .type('text/csv')
    .send(toCsv(rows, s.input));
});
