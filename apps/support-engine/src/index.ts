import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import { closeLocalDbPool } from '@whatsapp-platform/database';

const logger = createLogger({ name: 'support-engine' });

async function start() {
  try {
    const config = getConfig();
    logger.info(
      {
        service: 'support-engine',
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
      },
      'AI Support Engine initialized and ready for incoming conversation orchestration',
    );

    const heartbeatInterval = setInterval(() => {
      logger.debug(
        {
          service: 'support-engine',
          status: 'idle',
          uptime: process.uptime(),
        },
        'Support Engine heartbeat',
      );
    }, 60000);

    registerShutdownHandler(logger, async () => {
      logger.info('Stopping Support Engine...');
      clearInterval(heartbeatInterval);
      await closeLocalDbPool();
      logger.info('Support Engine stopped gracefully');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start Support Engine');
    process.exit(1);
  }
}

export * from './orchestrator.js';

// If run directly as a standalone process
if (process.argv[1]?.includes('support-engine')) {
  void start();
}

