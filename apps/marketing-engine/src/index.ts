import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import { closeLocalDbPool } from '@whatsapp-platform/database';

import { MarketingOrchestrator } from './orchestrator.js';

export * from './orchestrator.js';

const logger = createLogger({ name: 'marketing-engine' });

async function start() {
  try {
    const config = getConfig();
    const orchestrator = new MarketingOrchestrator();

    logger.info(
      {
        service: 'marketing-engine',
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
      },
      'Marketing Engine initialized and ready for campaign dispatch scheduling',
    );

    // Initial evaluation on startup (non-blocking)
    void orchestrator.runScheduledCampaign().catch((err) => {
      logger.error({ err }, 'Initial campaign run failed');
    });

    // Schedule regular campaign evaluation every 4 hours
    const campaignInterval = setInterval(() => {
      logger.info('Executing scheduled campaign evaluation tick');
      void orchestrator.runScheduledCampaign().catch((err) => {
        logger.error({ err }, 'Scheduled campaign run encountered an error');
      });
    }, 4 * 60 * 60 * 1000);

    registerShutdownHandler(logger, async () => {
      logger.info('Stopping Marketing Engine...');
      clearInterval(campaignInterval);
      await closeLocalDbPool();
      logger.info('Marketing Engine stopped gracefully');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start Marketing Engine');
    process.exit(1);
  }
}

// If run directly as a standalone process
if (process.argv[1]?.includes('marketing-engine')) {
  void start();
}

