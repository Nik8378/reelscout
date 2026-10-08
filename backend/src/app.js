import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { config, missingKeys } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '8mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url.includes('/stream') } }));
  app.use('/api/', rateLimit({ windowMs: 60_000, limit: 120 }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, missingKeys: missingKeys(), tiktok: config.ENABLE_TIKTOK });
  });

  app.use(errorHandler(logger));
  return app;
}
