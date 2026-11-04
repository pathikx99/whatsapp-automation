import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import { closeLocalDbPool } from '@whatsapp-platform/database';
import { buildServer } from './server.js';

const logger = createLogger({ name: 'api' });

async function start() {
  try {
    const config = getConfig();
    logger.info(
      {
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
        port: config.API_PORT,
        host: config.API_HOST,
      },
      'Starting API server...',
    );

    const server = await buildServer();

    await server.listen({
      port: config.API_PORT,
      host: config.API_HOST,
    });

    logger.info(
      `API server successfully listening on http://${config.API_HOST}:${config.API_PORT}`,
    );

    registerShutdownHandler(logger, async () => {
      logger.info('Closing HTTP server and database pools...');
      await server.close();
      await closeLocalDbPool();
      logger.info('API server teardown complete.');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start API server');
    process.exit(1);
  }
}

void start();
