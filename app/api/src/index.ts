import express from 'express';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

const logger = createLogger();

try {
  const config = loadConfig(process.env);
  const app = express();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API listening');
  });
} catch (err) {
  logger.error({ err }, 'API failed to start');
  process.exitCode = 1;
}
