import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: ['req.headers.authorization', '*.token', '*.apiKey'],
  transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
