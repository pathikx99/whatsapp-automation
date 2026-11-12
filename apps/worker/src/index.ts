import { getConfig, getBusinessProfile, formatTemplate } from '@whatsapp-platform/config';
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

function resolveButtons(
  profile: ReturnType<typeof getBusinessProfile>,
  buttonKeys: string[] = [],
  fallback: Array<{ id: string; title: string }>,
): Array<{ id: string; title: string }> {
  const registered = profile.navigation.buttons as Record<string, { id: string; title: string }>;
  const resolved = buttonKeys
    .map((k) => registered[k])
    .filter((b): b is { id: string; title: string } => Boolean(b));
  return resolved.length > 0 ? resolved : fallback;
}

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
          const promoNotice = activePromo
            ? `\n\n🎁 *Verified Offer Applied:* Code *${activePromo.code}* checkout me included hai!`
            : '';
          const customBody = profile.notifications?.replenishmentOrRebooking?.body;
          if (customBody) {
            reminderMsg = formatTemplate(customBody, {
              customerName: name,
              favoriteItem: favorite,
              reorderOrBookingUrl: reorderUrl,
              brandName: profile.brand.name,
              activePromoCode: activePromo?.code || '',
            });
            if (activePromo && !reminderMsg.includes(activePromo.code)) {
              reminderMsg += promoNotice;
            }
          } else {
            reminderMsg =
              `Warning: Critical Mukhwas Alert! 🚨\n\n` +
              `Hi ${name}! Hamari calculation kehti hai ki aapke *${favorite}* packet me ab bas aakhri 2-3 chammach bache honge! Aur un aakhri chammach ke liye ghar me ladai hona pakka hai ⚔️😅\n\n` +
              `Kal subah Surat se naya fresh batch pack hoke nikal raha hai. Bina daily ritual toote, direct 1-click me reorder karlo:${promoNotice}\n\n` +
              `👉 *Fresh Batch 1-Click Reorder:*\n${reorderUrl}`;
          }
        }

        const buttons = resolveButtons(
          profile,
          profile.notifications?.replenishmentOrRebooking?.buttonKeys,
          [
            {
              id: 'btn_reorder_favorites',
              title: profile.terminology?.reorderButtonTitle || '🔄 Reorder Favorites',
            },
            {
              id: 'btn_browse_catalog',
              title: profile.terminology?.browseButtonTitle || '🛒 Browse Treats',
            },
          ],
        );

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: reminderMsg,
          buttons,
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

        const customBody = profile.notifications?.csatPrompt?.body;
        const csatMsg = customBody
          ? formatTemplate(customBody, {
              customerName: name,
              brandName: brand,
              orderNumber: payload.orderNumber || '',
            })
          : `Hi ${name}! ✨\n\nEk hafte ho gaye fresh batch ke sath! Kaisa laga ${brand} ka crunch? Sach sach batana, taste kaisa laga? ⭐\n\nAapka feedback hume handcrafted quality aur better banane me help karega:`;

        const buttons = resolveButtons(
          profile,
          profile.notifications?.csatPrompt?.buttonKeys,
          [
            { id: 'btn_csat_5_stars', title: '⭐⭐⭐⭐⭐ (5 Stars)' },
            { id: 'btn_csat_4_stars', title: '⭐⭐⭐⭐ (4 Stars)' },
            { id: 'btn_csat_low_stars', title: '⭐ (1-3 Stars)' },
          ],
        );

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: csatMsg,
          buttons,
        });
        break;
      }

      case 'fridge_placement_tip': {
        const payload = job.payload as {
          customerPhone: string;
          customerName?: string;
        };

        const phone = payload.customerPhone;
        const name = payload.customerName || 'Friend';
        const profile = getBusinessProfile();

        const customBody = (profile.notifications as any)?.fridgePlacementTip?.body;
        const tipMsg = customBody
          ? formatTemplate(customBody, {
              customerName: name,
              brandName: profile.brand.name,
            })
          : `Hi ${name}! 🌿 Ek pro-tip Surat ki kitchen se: 🤫\n\nApne Paan Mukhwas ko fridge ke sabse neeche ya peeche mat chhupana — varna aankhon se door, pet se door ho jayega!\n\nIsse *fridge ke door pocket me* rakho, theek thande paani ki bottle ke bagal me. Khane ke baad jaise hi paani lene jaoge, samne hi chilled & crisp Paan dikhega! ❄️✨\n\nStay chilled & refreshed!`;

        const buttons = resolveButtons(
          profile,
          (profile.notifications as any)?.fridgePlacementTip?.buttonKeys,
          [
            { id: 'btn_fridge_placed', title: '❄️ Fridge Me Rakh Diya!' },
            { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          ],
        );

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: tipMsg,
          buttons,
        });
        break;
      }

      case 'dinner_habit_trigger': {
        const payload = job.payload as {
          customerPhone: string;
          customerName?: string;
        };

        const phone = payload.customerPhone;
        const name = payload.customerName || 'Friend';
        const profile = getBusinessProfile();

        const customBody = (profile.notifications as any)?.dinnerHabitTrigger?.body;
        const habitMsg = customBody
          ? formatTemplate(customBody, {
              customerName: name,
              brandName: profile.brand.name,
            })
          : `Plate saaf ho chuki hai na ${name}? 🍽️😉\n\nPar dil abhi bhi bol raha hoga: 'Yaar, khane ke baad kuch refreshing chahiye!'\n\nFridge kholo aur ek chilled chammach *Artisanal Paan Mukhwas* nikalo! Thandi-thandi gulkand aur crisp Calcuttia paan ka maza dinner ke baad alag hi level ka hai! ❄️🍃\n\nDinner ko do ek royal finish! ✨`;

        const buttons = resolveButtons(
          profile,
          (profile.notifications as any)?.dinnerHabitTrigger?.buttonKeys,
          [
            { id: 'btn_craving_satisfied', title: '🤤 Abhi Khata Hoon!' },
            { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          ],
        );

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: habitMsg,
          buttons,
        });
        break;
      }

      case 'table_anchor_cross_sell': {
        const payload = job.payload as {
          customerPhone: string;
          customerName?: string;
        };

        const phone = payload.customerPhone;
        const name = payload.customerName || 'Friend';
        const profile = getBusinessProfile();
        const ecommerceAdapter = createEcommerceAdapter();
        const activePromo = await ecommerceAdapter.getActivePromotion().catch(() => null);

        const seedsUrl = generatePrefilledCheckoutUrl(
          [
            {
              name: 'Seeds Fusion (200g)',
              quantity: 1,
              unitPrice: 249,
              sku: 'seeds-fusion-regular-200g',
            },
          ],
          activePromo?.code,
          profile.brand.links?.websiteUrl || profile.brand.websiteUrl,
        );

        const promoLine = activePromo
          ? `\n\n🎁 *Website Code Applied:* ${activePromo.code}`
          : '';

        const customBody = (profile.notifications as any)?.tableAnchorCrossSell?.body;
        const crossSellMsg = customBody
          ? formatTemplate(customBody, {
              customerName: name,
              brandName: profile.brand.name,
              seedsUrl,
              promoLine,
            })
          : `Ek mazedaar idea share karein ${name}? 💡\n\nPaan Mukhwas toh fridge me thand enjoy kar raha hai... Par din bhar ke snack ke liye dining table pe kya hai?\n\nMeet our *Seeds Fusion (6-Seed Powerhouse)*! Isse fridge ki zaroorat nahi — ye 24/7 aapki dining table pe rehta hai. White & black sesame, pumpkin, watermelon aur flax seeds ka tangy crunch! 🌱\n\nDono ka combo = Dining table pe crunch + Fridge me paan! 🌿${promoLine}\n\n👉 *Tap to view Seeds Fusion:*\n${seedsUrl}`;

        const buttons = resolveButtons(
          profile,
          (profile.notifications as any)?.tableAnchorCrossSell?.buttonKeys,
          [
            { id: 'btn_view_seeds_fusion', title: '🌱 Seeds Fusion' },
            { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          ],
        );

        await whatsappProvider.sendMessage({
          type: 'interactive',
          to: phone,
          body: crossSellMsg,
          buttons,
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
