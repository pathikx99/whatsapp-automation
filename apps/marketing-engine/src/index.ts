import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import { closeLocalDbPool } from '@whatsapp-platform/database';

const logger = createLogger({ name: 'marketing-engine' });

async function start() {
  try {
    const config = getConfig();
    logger.info(
      {
        service: 'marketing-engine',
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
      },
      'Marketing Engine initialized and ready for campaign dispatch scheduling',
    );

    // Heartbeat health logging for long-running engine process
    const heartbeatInterval = setInterval(() => {
      logger.debug(
        {
          service: 'marketing-engine',
          status: 'idle',
          uptime: process.uptime(),
        },
        'Marketing Engine heartbeat',
      );
    }, 60000);

    registerShutdownHandler(logger, async () => {
      logger.info('Stopping Marketing Engine...');
      clearInterval(heartbeatInterval);
      await closeLocalDbPool();
      logger.info('Marketing Engine stopped gracefully');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start Marketing Engine');
    process.exit(1);
  }
}

void start();
