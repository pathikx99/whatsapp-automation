import { getConfig } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import {
  closeLocalDbPool,
  getPlatformRepository,
  PlatformWorkerJob,
} from '@whatsapp-platform/database';
import { createWhatsAppProvider, OutboundWhatsAppMessage } from '@whatsapp-platform/whatsapp';
import { MarketingOrchestrator } from '@whatsapp-platform/marketing-engine';

const logger = createLogger({ name: 'worker' });

export async function processSingleJob(job: PlatformWorkerJob): Promise<void> {
  const platformRepo = getPlatformRepository();
  const whatsappProvider = createWhatsAppProvider();
  const marketingOrchestrator = new MarketingOrchestrator();

  logger.info({ jobId: job.id, type: job.jobType }, 'Processing queue job');
  await platformRepo.updateJobStatus(job.id, 'processing');

  try {
    switch (job.jobType) {
      case 'send_whatsapp': {
        const msg = job.payload as unknown as OutboundWhatsAppMessage;
        await whatsappProvider.sendMessage(msg);
        break;
      }

      case 'run_marketing_campaign': {
        await marketingOrchestrator.runScheduledCampaign();
        break;
      }

      default:
        logger.warn(
          { jobId: job.id, type: job.jobType },
          'Unrecognized worker job type; marking completed',
        );
    }

    await platformRepo.updateJobStatus(job.id, 'completed');
    logger.info({ jobId: job.id, type: job.jobType }, 'Queue job completed successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: job.id, err: errorMsg }, 'Error executing queue job');
    await platformRepo.updateJobStatus(job.id, 'failed', errorMsg);
  }
}

async function start() {
  try {
    const config = getConfig();
    const platformRepo = getPlatformRepository();

    logger.info(
      {
        service: 'worker',
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
      },
      'Background Task Worker operational. Actively polling job queue.',
    );

    let isPolling = true;

    // Process queued jobs every 10 seconds
    const queuePollInterval = setInterval(async () => {
      if (!isPolling) return;
      try {
        const pendingJobs = await platformRepo.fetchPendingJobs(5);
        if (pendingJobs.length > 0) {
          logger.info({ count: pendingJobs.length }, 'Discovered pending worker queue jobs');
          for (const job of pendingJobs) {
            await processSingleJob(job);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error during worker queue polling cycle');
      }
    }, 10000);

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      logger.debug(
        {
          service: 'worker',
          status: 'running',
          uptime: process.uptime(),
        },
        'Worker queue loop heartbeat',
      );
    }, 60000);

    registerShutdownHandler(logger, async () => {
      logger.info('Stopping Background Worker...');
      isPolling = false;
      clearInterval(queuePollInterval);
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
