import { createApp } from './app.js';
import { config, missingKeys } from './config.js';
import { logger } from './logger.js';
import './db.js';

const app = createApp();
app.listen(config.PORT, () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
  const missing = missingKeys();
  if (missing.length) logger.warn({ missing }, 'Some API keys are missing - those sources will report errors');
});
