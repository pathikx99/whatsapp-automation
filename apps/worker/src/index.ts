import { getConfig, getBusinessProfile } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import {
  closeLocalDbPool,
  getPlatformRepository,
  PlatformWorkerJob,
} from '@whatsapp-platform/database';
import { createWhatsAppProvider, OutboundWhatsAppMessage } from '@whatsapp-platform/whatsapp';
import { MarketingOrchestrator } from '@whatsapp-platform/marketing-engine';
import {
  createEcommerceAdapter,
  generatePrefilledCheckoutUrl,
} from '@whatsapp-platform/ecommerce-adapter';

const logger = createLogger({ name: 'worker' });

export async function processSingleJob(job: PlatformWorkerJob): Promise<void> {
  const platformRepo = getPlatformRepository();
  const whatsappProvider = createWhatsAppProvider();
  const marketingOrchestrator = new MarketingOrchestrator();

  logger.info({ jobId: job.id, type: job.jobType }, 'Processing queue job');
  job.status = 'processing';
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

      case 'replenishment_reminder': {
        const payload = job.payload as {
          customerPhone: string;
          customerName?: string;
          orderNumber?: string;
          items?: Array<{
            name: string;
            quantity: number;
            sku?: string;
            unitPrice?: number;
            price?: number;
          }>;
          favoriteProduct?: string;
          estimatedDays?: number;
        };

        const phone = payload.customerPhone;
        const name = payload.customerName || 'Friend';
        const favorite =
          payload.favoriteProduct || payload.items?.[0]?.name || 'Artisanal Paan Mukhwas (300g)';

        const rawItems = payload.items || [
          {
            name: 'Artisanal Paan Mukhwas (300g)',
            quantity: 1,
            unitPrice: 249,
            sku: 'paan-mukhwas-300g',
          },
        ];

        const ecommerceAdapter = createEcommerceAdapter();
        const activePromo = await ecommerceAdapter.getActivePromotion().catch(() => null);

        // Format direct 1-click reorder checkout link prefilled with favorite treats
        // ONLY attach verified promoCode if active in website DB; otherwise clean link with zero discount
        const reorderUrl = generatePrefilledCheckoutUrl(
          rawItems.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? i.price ?? 249,
            sku: i.sku || i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          })),
          activePromo?.code,
        );

        const profile = getBusinessProfile();
        const isService = profile.businessType === 'service';

        let reminderMsg: string;
        if (isService) {
          reminderMsg =
            `Hi ${name}! ✨\n\n` +
            `It's been a few weeks since your last visit for *${favorite}* at ${profile.brand.name}.\n\n` +
            `To keep up your regular care and results, we'd love to welcome you back!\n\n` +
            `👉 *Tap here to schedule your next appointment:*\n${profile.brand.links?.cartUrl || profile.brand.websiteUrl}`;
        } else {
          reminderMsg =
            `Hi ${name}! 🌿\n\n` +
            `Your daily jar of *${favorite}* might be running low! A 300g pack lasts about 3-4 weeks for a typical household.\n\n` +
            `Keep your daily after-meal digestive freshness uninterrupted — handcrafted fresh and packed right before dispatch.\n\n` +
            `👉 *Tap to reorder your favorites in 1 click:*\n${reorderUrl}`;
        }

        const reorderBtnTitle = profile.terminology?.reorderButtonTitle || '🔄 Reorder Favorites';
        const browseBtnTitle = profile.terminology?.browseButtonTitle || '🛒 Browse Treats';

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: reminderMsg,
          buttons: [
            { id: 'btn_reorder_favorites', title: reorderBtnTitle },
            { id: 'btn_browse_catalog', title: browseBtnTitle },
          ],
        });
        break;
      }

      case 'csat_review_prompt': {
        const payload = job.payload as {
          customerPhone: string;
          customerName?: string;
          orderNumber?: string;
        };

        const phone = payload.customerPhone;
        const name = payload.customerName || 'Friend';
        const profile = getBusinessProfile();
        const brand = profile.brand.name;

        const csatMsg =
          `Hi ${name}! ✨\n\n` +
          `How was your experience with ${brand}? We hope you are loving your handcrafted mouth fresheners!\n\n` +
          `Please rate your experience with us below (1–5 stars):`;

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: csatMsg,
          buttons: [
            { id: 'btn_csat_5_stars', title: '⭐⭐⭐⭐⭐ (5 Stars)' },
            { id: 'btn_csat_4_stars', title: '⭐⭐⭐⭐ (4 Stars)' },
            { id: 'btn_csat_low_stars', title: '⭐ (1-3 Stars)' },
          ],
        });
        break;
      }

      default:
        logger.warn(
          { jobId: job.id, type: job.jobType },
          'Unrecognized worker job type; marking completed',
        );
    }

    job.status = 'completed';
    await platformRepo.updateJobStatus(job.id, 'completed');
    logger.info({ jobId: job.id, type: job.jobType }, 'Queue job completed successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    job.status = 'failed';
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
