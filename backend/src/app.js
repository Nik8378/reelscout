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

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '12mb' }));
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url.includes('/stream') || req.url.startsWith('/api/images') },
    serializers: { req: (r) => ({ method: r.method, url: r.url }), res: (r) => ({ status: r.statusCode }) },
  }));
  app.use('/api/', rateLimit({ windowMs: 60_000, limit: 300 }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, missingKeys: missingKeys(), tiktok: config.ENABLE_TIKTOK });
  });
  app.use('/api/images', imagesRouter);
  app.use('/api/resolve', resolveRouter);

  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}` } }));
  app.use(errorHandler(logger));
  return app;
}
