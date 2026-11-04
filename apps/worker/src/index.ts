import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import { closeLocalDbPool } from '@whatsapp-platform/database';

const logger = createLogger({ name: 'worker' });

async function start() {
  try {
    const config = getConfig();
    logger.info(
      {
        service: 'worker',
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
      },
      'Background Task Worker initialized and waiting for job queue processing',
    );

    const heartbeatInterval = setInterval(() => {
      logger.debug(
        {
          service: 'worker',
          status: 'idle',
          uptime: process.uptime(),
        },
        'Worker heartbeat',
      );
    }, 60000);

    registerShutdownHandler(logger, async () => {
      logger.info('Stopping Background Worker...');
      clearInterval(heartbeatInterval);
      await closeLocalDbPool();
      logger.info('Background Worker stopped gracefully');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start Background Worker');
    process.exit(1);
  }
}

void start();
