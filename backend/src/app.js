import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { config, missingKeys } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './utils/errors.js';
import { imagesRouter } from './routes/images.js';
import { resolveRouter } from './routes/resolve.js';
import { searchRouter } from './routes/search.js';
import { historyRouter, shortlistRouter } from './routes/history.js';
import { geminiStatus } from './brain/gemini.js';
import { queueStats } from './pipeline/jobs.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '12mb' }));
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url.includes('/stream') || req.url.startsWith('/api/images') || req.url === '/api/health' },
    serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ status: r.statusCode }) },
  }));
  app.use('/api/', rateLimit({ windowMs: 60_000, limit: 600 }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      missingKeys: missingKeys(),
      vision: geminiStatus(),
      tiktokDefault: config.ENABLE_TIKTOK,
      minPerSource: config.MIN_PER_SOURCE,
      thresholds: { show: config.MATCH_THRESHOLD_SHOW, exact: config.MATCH_THRESHOLD_EXACT },
      queue: queueStats(),
    });
  });
  app.use('/api/images', imagesRouter);
  app.use('/api/resolve', resolveRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/shortlist', shortlistRouter);

  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}` } }));
  app.use(errorHandler(logger));
  return app;
}
