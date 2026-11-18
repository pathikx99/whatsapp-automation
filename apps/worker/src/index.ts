import { getConfig, getBusinessProfile, formatTemplate } from '@whatsapp-platform/config';
import { createLogger, registerShutdownHandler } from '@whatsapp-platform/shared';
import {
  closeLocalDbPool,
  getPlatformRepository,
  getEnterpriseRepository,
  getMultiTenantRepository,
  PlatformWorkerJob,
  PlatformDailyReportRecord,
} from '@whatsapp-platform/database';
import {
  createWhatsAppProvider,
  createEmailProvider,
  createVoiceProvider,
  OutboundWhatsAppMessage,
} from '@whatsapp-platform/whatsapp';
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
        const tenantId = (job.payload?.tenantId as string) || '00000000-0000-0000-0000-000000000001';
        const multiTenantRepo = getMultiTenantRepository();
        await multiTenantRepo.recordUsage(tenantId, 'messages', 1);
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
        if (typeof (platformRepo as any).isCustomerOptedOut === 'function') {
          const optedOut = await (platformRepo as any).isCustomerOptedOut(phone);
          if (optedOut) {
            logger.info({ phone, jobType: job.jobType }, 'Skipping review prompt due to customer opt-out');
            break;
          }
        }
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
        if (typeof (platformRepo as any).isCustomerOptedOut === 'function') {
          const optedOut = await (platformRepo as any).isCustomerOptedOut(phone);
          if (optedOut) {
            logger.info({ phone, jobType: job.jobType }, 'Skipping dinner habit trigger due to customer opt-out');
            break;
          }
        }
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
        if (typeof (platformRepo as any).isCustomerOptedOut === 'function') {
          const optedOut = await (platformRepo as any).isCustomerOptedOut(phone);
          if (optedOut) {
            logger.info({ phone, jobType: job.jobType }, 'Skipping table anchor cross sell due to customer opt-out');
            break;
          }
        }
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

      case 'retry_report_delivery':
      case 'generate_daily_report': {
        const payload = (job.payload || {}) as {
          dateIST?: string;
          reportId?: string;
          retryOnlyDelivery?: boolean;
          recipientPhone?: string;
        };
        const dateIST = payload.dateIST;
        let saved: PlatformDailyReportRecord | null = null;

        // If retrying delivery, attempt to reuse existing report without regenerating
        if (payload.retryOnlyDelivery || job.jobType === 'retry_report_delivery' || payload.reportId) {
          if (dateIST) {
            saved = await platformRepo.getDailyReport(dateIST);
          }
        }

        if (!saved) {
          logger.info({ dateIST }, 'Worker compiling Mintara AI Daily Intelligence Report (22:00 IST)');
          const reportData = await platformRepo.compileDailyReport(dateIST);
          saved = await platformRepo.saveDailyReport(reportData);
        } else {
          logger.info(
            { dateIST, reportId: saved.id },
            'Reusing existing compiled daily report for delivery retry (no regeneration)',
          );
        }

        const settings = await platformRepo.getDailyReportSettings();
        const config = getConfig();
        const recipients = new Set<string>();

        if (payload.recipientPhone) {
          recipients.add(payload.recipientPhone);
        } else {
          if (Array.isArray(settings.recipientPhoneNumbers)) {
            for (const p of settings.recipientPhoneNumbers) {
              recipients.add(p);
            }
          }
          if (config.REPORTING_ALERT_PHONE_NUMBER) {
            recipients.add(config.REPORTING_ALERT_PHONE_NUMBER);
          }
          if (config.ADMIN_ALERT_PHONE_NUMBER) {
            recipients.add(config.ADMIN_ALERT_PHONE_NUMBER);
          }
        }

        if (settings.whatsappDeliveryEnabled && recipients.size > 0) {
          for (const phone of recipients) {
            try {
              const sendRes = await whatsappProvider.sendMessage({
                type: 'text',
                to: phone,
                body: saved.summary,
              });
              await platformRepo.recordReportDelivery({
                reportId: saved.id,
                channel: 'whatsapp',
                recipient: phone,
                status: 'delivered',
                metaWamid: sendRes.messageId,
              });
            } catch (sendErr) {
              const errStr = sendErr instanceof Error ? sendErr.message : String(sendErr);
              logger.error({ err: errStr, phone }, 'Failed delivering daily report via WhatsApp');
              await platformRepo.recordReportDelivery({
                reportId: saved.id,
                channel: 'whatsapp',
                recipient: phone,
                status: 'failed',
                errorMessage: errStr,
              });
            }
          }
        }

        await platformRepo.recordReportDelivery({
          reportId: saved.id,
          channel: 'dashboard',
          recipient: 'command_center',
          status: 'delivered',
        });
        break;
      }

      case 'execute_campaign': {
        const payload = (job.payload || {}) as {
          campaignId: string;
          scheduledBy?: string;
          channel?: string;
          tenantId?: string;
        };
        const tenantId = payload.tenantId || '00000000-0000-0000-0000-000000000001';
        const enterpriseRepo = getEnterpriseRepository();
        const campaigns = await enterpriseRepo.listCampaignDefinitions(tenantId);
        const campaign = campaigns.find((c) => c.id === payload.campaignId);

        if (!campaign) {
          logger.warn({ campaignId: payload.campaignId }, 'Campaign definition not found; skipping execution');
          break;
        }

        if (!campaign.isEnabled) {
          logger.info({ campaignId: payload.campaignId }, 'Campaign is inactive; skipping execution');
          break;
        }

        const execution = await enterpriseRepo.createCampaignExecution({
          campaignId: campaign.id,
          totalTarget: 1,
          scheduledFor: new Date().toISOString(),
        });

        const ecommerceAdapter = createEcommerceAdapter();
        const candidates = await ecommerceAdapter.getMarketingCandidates();

        let sentCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const candidate of candidates) {
          const phone = candidate.customer.phoneNumber;
          if (!phone) continue;
          const suppCheck = await enterpriseRepo.isCustomerSuppressed(phone);
          if (suppCheck.suppressed) {
            skippedCount++;
            continue;
          }

          try {
            const body = campaign.messageTemplate || 'Special treat awaits you at Mintara Bites!';
            await whatsappProvider.sendMessage({
              type: 'text',
              to: phone,
              body,
            });
            await enterpriseRepo.recordCampaignRecipient({
              tenantId: campaign.tenantId,
              executionId: execution.id,
              campaignId: campaign.id,
              customerId: candidate.customer.id,
              phoneNumber: phone,
              status: 'sent',
            });
            sentCount++;
          } catch (sendErr) {
            failedCount++;
            logger.error({ err: sendErr, customerId: candidate.customer.id }, 'Failed sending campaign WhatsApp message');
          }
        }

        logger.info({ campaignId: campaign.id, sentCount, skippedCount, failedCount }, 'Campaign execution completed');
        break;
      }

      case 'send_supplier_email': {
        const payload = (job.payload || {}) as {
          supplierId?: string;
          to: string;
          subject: string;
          body: string;
        };
        const emailProvider = createEmailProvider();
        const sendRes = await emailProvider.sendEmail({
          to: payload.to,
          subject: payload.subject,
          text: payload.body,
        });

        if (payload.supplierId) {
          const enterpriseRepo = getEnterpriseRepository();
          await enterpriseRepo.recordSupplierInteraction({
            supplierId: payload.supplierId,
            interactionType: 'email',
            initiatedBy: 'ai',
            subject: payload.subject,
            summary: payload.body,
          });
        }
        logger.info({ to: payload.to, id: sendRes.id }, 'Supplier email successfully dispatched');
        break;
      }

      case 'initiate_supplier_call': {
        const payload = (job.payload || {}) as {
          supplierId?: string;
          phoneNumber: string;
          callerName?: string;
          purpose?: string;
          promptContext?: string;
        };
        const voiceProvider = createVoiceProvider();
        const callRes = await voiceProvider.initiateCall({
          phoneNumber: payload.phoneNumber,
          callerIdentity: payload.callerName || 'Mintara Bites Manager',
          purpose: payload.purpose || 'Material quotation follow-up',
          initialScriptPrompt: payload.promptContext,
        });

        if (payload.supplierId) {
          const enterpriseRepo = getEnterpriseRepository();
          const mappedStatus: 'initiated' | 'failed' = callRes.status === 'failed' ? 'failed' : 'initiated';
          await enterpriseRepo.recordSupplierCall({
            tenantId: '00000000-0000-0000-0000-000000000001',
            supplierId: payload.supplierId,
            phoneNumber: payload.phoneNumber,
            callerIdentity: 'Mintara Bites Manager',
            provider: 'mock',
            providerCallId: callRes.callId,
            callStatus: mappedStatus,
            durationSeconds: 0,
            recipientLanguage: 'hi-IN',
            transcript: 'Automated telephonic call initiated to supplier.',
            tentativeAgreement: { initiatedAt: new Date().toISOString() },
          });
        }
        logger.info({ callId: callRes.callId, status: callRes.status }, 'Supplier automated call initiated');
        break;
      }

      case 'recalculate_customer_segments': {
        const enterpriseRepo = getEnterpriseRepository();
        const ecommerceAdapter = createEcommerceAdapter();
        const rfmSummary = await ecommerceAdapter.getRFMSegments();
        const segments = await enterpriseRepo.listCustomerSegments();

        for (const seg of segments) {
          let count = 0;
          if (seg.slug === 'loyal' || seg.slug === 'champions') {
            count = rfmSummary.champions.length;
          } else if (seg.slug === 'at_risk') {
            count = rfmSummary.atRisk.length;
          } else if (seg.slug === 'dormant') {
            count = rfmSummary.dormant.length;
          } else {
            count = rfmSummary.counts.total;
          }
          await enterpriseRepo.updateSegmentMemberCount(seg.id, count);
        }
        logger.info({ totalCustomers: rfmSummary.counts.total }, 'Recalculated customer RFM segmentation counts');
        break;
      }

      case 'reconcile_ecommerce_changes': {
        const enterpriseRepo = getEnterpriseRepository();
        const ecommerceAdapter = createEcommerceAdapter();
        const products = await ecommerceAdapter.getAllActiveProducts();

        for (const prod of products) {
          for (const variant of prod.variants || []) {
            if (typeof variant.stockQty === 'number' && variant.stockQty <= 5) {
              await enterpriseRepo.createOperationalAlert({
                category: 'manufacturing',
                severity: variant.stockQty === 0 ? 'critical' : 'high',
                title: `Low Stock: ${prod.title} (${variant.flavor || variant.sku})`,
                summary: `Stock level dropped to ${variant.stockQty} units in store catalog.`,
                recommendedAction: 'Notify manufacturing or procurement agent for replenishment.',
              });
            }
          }
        }
        logger.info({ productCount: products.length }, 'Reconciled ecommerce changes and stock thresholds');
        break;
      }

      default:
        logger.warn(
          { jobId: job.id, type: job.jobType },
          'Unrecognized worker job type; marking completed',
        );
    }

    job.status = 'completed';
    if (typeof platformRepo.markJobCompleted === 'function') {
      await platformRepo.markJobCompleted(job.id);
    } else {
      await platformRepo.updateJobStatus(job.id, 'completed');
    }
    logger.info({ jobId: job.id, type: job.jobType }, 'Queue job completed successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: job.id, err: errorMsg }, 'Error executing queue job');
    if (typeof platformRepo.markJobFailedOrRetry === 'function') {
      const retryResult = await platformRepo.markJobFailedOrRetry(job.id, errorMsg);
      job.status = retryResult.status === 'dead_letter' ? 'dead_letter' : 'pending';
    } else {
      await platformRepo.updateJobStatus(job.id, 'failed', errorMsg);
      job.status = 'failed';
    }
  }
}

async function start() {
  try {
    const config = getConfig();
    const platformRepo = getPlatformRepository();
    const workerId = `worker_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
    const lockTimeoutSec = Math.round((config.WORKER_JOB_LOCK_TIMEOUT_MS || 300000) / 1000);
    const pollIntervalMs = config.WORKER_POLL_INTERVAL_MS || 10000;

    logger.info(
      {
        service: 'worker',
        workerId,
        nodeEnv: config.NODE_ENV,
        appEnv: config.APP_ENV,
        pollIntervalMs,
        lockTimeoutSec,
      },
      'Background Task Worker operational. Actively polling job queue with atomic locking.',
    );

    let isPolling = true;
    let activeJobsCount = 0;
    let lastReportDateScheduled = '';

    // Check 22:00 IST schedule for daily reports
    const checkDailyReportSchedule = async () => {
      try {
        const now = new Date();
        const istTimeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);

        const istDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now);

        const settings = await platformRepo.getDailyReportSettings();
        const targetTime = settings.scheduledTime || config.REPORTING_DAILY_TIME || '22:00';

        if (istTimeStr === targetTime && lastReportDateScheduled !== istDateStr) {
          lastReportDateScheduled = istDateStr;
          logger.info({ istDateStr, targetTime }, 'Triggering scheduled daily report generation for 22:00 IST');

          // Check if report job is already enqueued to prevent duplicate queuing
          const scheduled = await platformRepo.fetchScheduledJobs('generate_daily_report');
          const alreadyQueued = scheduled.some((j) => (j.payload as any)?.dateIST === istDateStr);

          if (!alreadyQueued) {
            await platformRepo.enqueueJob('generate_daily_report', { dateIST: istDateStr });
            logger.info({ istDateStr }, 'Enqueued generate_daily_report background task');
          }
        }
      } catch (schedErr) {
        logger.error({ err: schedErr }, 'Error checking 22:00 IST daily report schedule');
      }
    };

    // Process queued jobs using atomic claiming
    const queuePollInterval = setInterval(async () => {
      if (!isPolling) return;
      try {
        await checkDailyReportSchedule();

        const pendingJobs = await platformRepo.claimPendingJobs(workerId, 5, lockTimeoutSec);
        if (pendingJobs.length > 0) {
          logger.info({ count: pendingJobs.length, workerId }, 'Claimed pending worker queue jobs');
          for (const job of pendingJobs) {
            if (!isPolling) break;
            activeJobsCount++;
            try {
              await processSingleJob(job);
            } finally {
              activeJobsCount = Math.max(0, activeJobsCount - 1);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error during worker queue polling cycle');
      }
    }, pollIntervalMs);

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      logger.debug(
        {
          service: 'worker',
          workerId,
          status: 'running',
          activeJobs: activeJobsCount,
          uptime: process.uptime(),
        },
        'Worker queue loop heartbeat',
      );
    }, 60000);

    registerShutdownHandler(logger, async () => {
      logger.info({ workerId, activeJobs: activeJobsCount }, 'Stopping Background Worker gracefully...');
      isPolling = false;
      clearInterval(queuePollInterval);
      clearInterval(heartbeatInterval);

      // Wait up to 5 seconds for any currently active jobs to finish processing
      const drainStart = Date.now();
      while (activeJobsCount > 0 && Date.now() - drainStart < 5000) {
        await new Promise((r) => setTimeout(r, 200));
      }

      await closeLocalDbPool();
      logger.info({ workerId }, 'Background Worker stopped gracefully');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start Background Worker');
    process.exit(1);
  }
}

void start();
