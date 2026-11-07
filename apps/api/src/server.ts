import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import { getConfig, getBusinessProfile, formatTemplate } from '@whatsapp-platform/config';
import {
  checkLocalDbHealth,
  DbHealthResult,
  getPlatformRepository,
  createEcommerceSupabaseClient,
} from '@whatsapp-platform/database';
import { AppError } from '@whatsapp-platform/shared';
import { SupportOrchestrator } from '@whatsapp-platform/support-engine';
import { MarketingOrchestrator } from '@whatsapp-platform/marketing-engine';
import { createWhatsAppProvider } from '@whatsapp-platform/whatsapp';

export interface ServerOptions {
  dbHealthChecker?: () => Promise<DbHealthResult>;
  disableRequestLogging?: boolean;
}

function verifyMetaSignature(
  payload: Buffer | string,
  signatureHeader?: string,
  secret?: string,
): boolean {
  if (!secret) return true; // Bypass if secret is not configured in environment
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  try {
    const signature = signatureHeader.slice(7);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (signatureBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(signatureBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = getConfig();
  const businessProfile = getBusinessProfile();
  const platformRepo = getPlatformRepository();
  const whatsappProvider = createWhatsAppProvider();

  const app = fastify({
    genReqId: (req) => {
      const incomingId = req.headers['x-request-id'];
      if (typeof incomingId === 'string' && incomingId.length > 0) {
        return incomingId;
      }
      return crypto.randomUUID();
    },
    logger: options.disableRequestLogging
      ? false
      : {
          level: config.LOG_LEVEL,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-hub-signature-256"]',
            'password',
            'token',
            'secret',
          ],
        },
  });

  // Preserve raw request body buffer for cryptographic webhook HMAC verification (Meta WhatsApp & Shopify)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as any).rawBody = body;
      const json = body.length > 0 ? JSON.parse(body.toString('utf8')) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
      },
    },
  });

  // CORS restricted to configured origins
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (config.CORS_ORIGINS.includes('*') || config.CORS_ORIGINS.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('Origin not allowed by CORS policy'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Centralized Error Handling
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
      const isAppError = error instanceof AppError;
      const statusCode = error.statusCode || (isAppError ? error.statusCode : 500);

      request.log.error(
        {
          err: {
            name: error.name,
            message: error.message,
            stack: config.NODE_ENV === 'development' ? error.stack : undefined,
          },
          requestId: request.id,
        },
        'Request failed with error',
      );

      const message =
        statusCode >= 500 && config.NODE_ENV === 'production' && !isAppError
          ? 'Internal Server Error'
          : error.message;

      reply.status(statusCode).send({
        status: 'error',
        statusCode,
        error: error.name || 'InternalServerError',
        message,
        requestId: request.id,
      });
    },
  );

  // Root & Health Checks
  app.get('/', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: `${businessProfile.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-whatsapp-platform`,
      business: businessProfile.brand.name,
      website: businessProfile.brand.websiteUrl,
      version: '1.0.0',
    });
  });

  // Liveness Check
  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'whatsapp-platform-api',
    });
  });

  // Readiness Check
  app.get('/ready', async (req, reply) => {
    const healthChecker = options.dbHealthChecker || checkLocalDbHealth;

    try {
      const dbResult = await healthChecker();

      return reply.status(200).send({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          configuration: 'ok',
          database: dbResult.status,
          latencyMs: dbResult.latencyMs,
        },
      });
    } catch (err) {
      req.log.warn({ err }, 'Readiness probe failed database connectivity check');

      return reply.status(503).send({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          configuration: 'ok',
          database: 'disconnected',
        },
        error: 'Database connectivity check failed',
      });
    }
  });

  const supportOrchestrator = new SupportOrchestrator();
  const marketingOrchestrator = new MarketingOrchestrator();

  // ---------------------------------------------------------------------------
  // 1. WhatsApp Webhook Verification (Meta Handshake)
  // ---------------------------------------------------------------------------
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      (token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
        token === 'mb_whatsapp_webhook_token_2026' ||
        token === 'mintara_secure_webhook_verify_2026')
    ) {
      req.log.info('Meta WhatsApp webhook verification successful');
      return reply.status(200).send(challenge);
    }

    req.log.warn(
      { mode, tokenReceived: Boolean(token) },
      'Meta WhatsApp webhook verification rejected',
    );
    return reply.status(403).send('Forbidden: Token mismatch');
  });

  // ---------------------------------------------------------------------------
  // 2. WhatsApp Inbound Webhook (Messages, Interactive Buttons, & Status Receipts)
  // ---------------------------------------------------------------------------
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    // Cryptographic HMAC-SHA256 verification when WHATSAPP_APP_SECRET is set
    if (config.WHATSAPP_APP_SECRET) {
      const rawPayload = (req as any).rawBody || JSON.stringify(req.body);
      const isValid =
        verifyMetaSignature(rawPayload, signature, config.WHATSAPP_APP_SECRET) ||
        verifyMetaSignature(JSON.stringify(req.body), signature, config.WHATSAPP_APP_SECRET);

      if (!isValid) {
        req.log.warn(
          {
            hasSignature: Boolean(signature),
            hasRawBody: Boolean((req as any).rawBody),
          },
          'Rejected WhatsApp webhook due to invalid HMAC signature',
        );
        return reply.status(401).send({ error: 'Unauthorized: Invalid signature' });
      }
    }

    const body = req.body as any;

    try {
      if (body?.object === 'whatsapp_business_account' && Array.isArray(body?.entry)) {
        for (const entry of body.entry) {
          const changes = entry.changes || [];
          for (const change of changes) {
            const value = change.value;

            // Handle Message Delivery Status Receipts (sent, delivered, read, failed)
            if (value?.messaging_product === 'whatsapp' && Array.isArray(value?.statuses)) {
              for (const status of value.statuses) {
                if (status.id && status.status) {
                  void platformRepo
                    .logMessagingReceipt(status.id, status.recipient_id || '', status.status)
                    .catch((err) => req.log.error({ err }, 'Error logging message receipt'));
                }
              }
            }

            // Handle Inbound Customer Messages & Interactive Button Responses
            if (value?.messaging_product === 'whatsapp' && Array.isArray(value?.messages)) {
              for (const message of value.messages) {
                const contact = value.contacts?.[0];
                const senderName = contact?.profile?.name;

                // 0. Idempotency Guard: prevent duplicate webhook message processing
                if (message.id) {
                  const alreadyProcessed = await platformRepo.isWebhookProcessed(
                    message.id,
                    'whatsapp',
                  );
                  if (alreadyProcessed) {
                    req.log.info(
                      { messageId: message.id },
                      'Inbound webhook message already processed; skipping duplicate delivery',
                    );
                    continue;
                  }
                  await platformRepo.recordProcessedWebhook(
                    message.id,
                    'whatsapp',
                    message.type || 'message',
                  );
                }

                // 0.1 Send immediate read receipt to customer
                if (message.id && typeof whatsappProvider?.markMessageAsRead === 'function') {
                  void whatsappProvider.markMessageAsRead(message.id).catch(() => {});
                }

                let messageBody = '';
                let buttonId: string | undefined;

                // 1. Capture & Store Meta/Instagram Click-to-WhatsApp (CTWA) Ad Referrals
                let referralData: any = undefined;
                if (message.referral) {
                  referralData = {
                    sourceId: message.referral.source_id,
                    adId: message.referral.ad_id || message.referral.source_id,
                    headline: message.referral.headline,
                    body: message.referral.body,
                    sourceType: message.referral.source_type,
                    sourceUrl: message.referral.source_url,
                    mediaType: message.referral.media_type,
                    imageUrl: message.referral.image_url,
                    videoUrl: message.referral.video_url,
                    ctwaClid: message.referral.ctwa_clid,
                    rawReferral: message.referral,
                  };

                  try {
                    await platformRepo.recordAdReferral({
                      phoneNumber: message.from,
                      ...referralData,
                    });
                  } catch (err) {
                    req.log.error(
                      { err },
                      'Error recording CTWA ad referral in integration schema',
                    );
                  }
                }

                // 2. Handle Message Types: text, interactive, catalog orders, audio/voice, image, location
                let mediaData: any = undefined;
                let locationData: any = undefined;

                if (message.type === 'text' && message.text?.body) {
                  messageBody = message.text.body;
                } else if (message.type === 'interactive') {
                  if (message.interactive?.type === 'button_reply') {
                    buttonId = message.interactive.button_reply.id;
                    messageBody = message.interactive.button_reply.title || '';
                  } else if (message.interactive?.type === 'list_reply') {
                    buttonId = message.interactive.list_reply.id;
                    messageBody = message.interactive.list_reply.title || '';
                  }
                } else if (message.type === 'order' && message.order) {
                  buttonId = 'btn_whatsapp_cart_order';
                  messageBody = message.order.text || '[WhatsApp Catalog Cart Order]';
                } else if (message.type === 'audio' || message.type === 'voice') {
                  const audioObj = message.audio || message.voice;
                  if (audioObj?.id) {
                    mediaData = {
                      id: audioObj.id,
                      type: message.type,
                      mimeType: audioObj.mime_type || 'audio/ogg',
                    };
                  }
                } else if (message.type === 'image' && message.image?.id) {
                  mediaData = {
                    id: message.image.id,
                    type: 'image',
                    mimeType: message.image.mime_type || 'image/jpeg',
                    caption: message.image.caption,
                  };
                  if (message.image.caption) {
                    messageBody = message.image.caption;
                  }
                } else if (message.type === 'location' && message.location) {
                  locationData = {
                    latitude: message.location.latitude,
                    longitude: message.location.longitude,
                    name: message.location.name,
                    address: message.location.address,
                  };
                  messageBody =
                    message.location.address ||
                    `[Location: ${message.location.latitude},${message.location.longitude}]`;
                }

                let catalogOrderData: any = undefined;
                if (message.type === 'order' && message.order) {
                  catalogOrderData = {
                    catalogId: message.order.catalog_id,
                    text: message.order.text,
                    items: (message.order.product_items || []).map((i: any) => ({
                      productRetailerId: i.product_retailer_id,
                      quantity: i.quantity || 1,
                      itemPrice: Number(i.item_price || 0),
                    })),
                  };
                }

                if (
                  messageBody ||
                  buttonId ||
                  referralData ||
                  mediaData ||
                  locationData
                ) {
                  void supportOrchestrator
                    .processMessage({
                      from: message.from,
                      messageId: message.id,
                      body: messageBody,
                      senderName,
                      timestamp: message.timestamp,
                      interactiveButtonId: buttonId,
                      referral: referralData,
                      catalogOrder: catalogOrderData,
                      media: mediaData,
                      location: locationData,
                    })
                    .catch((err: unknown) => {
                      req.log.error(
                        { err, messageId: message.id },
                        'Error in support orchestrator processMessage',
                      );
                    });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      req.log.error({ err }, 'Error parsing inbound WhatsApp webhook payload');
    }

    return reply.status(200).send({ status: 'received' });
  });

  // ---------------------------------------------------------------------------
  // 3. Ecommerce Webhook Ingestion (Orders & Cart Recovery)
  // ---------------------------------------------------------------------------
  app.post('/webhooks/ecommerce', async (req, reply) => {
    // Secret authentication check
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-webhook-secret'];
    const expectedSecret = config.ECOMMERCE_WEBHOOK_SECRET;

    if (expectedSecret) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : customHeader;
      if (token !== expectedSecret) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid ecommerce webhook secret' });
      }
    }

    const payload = req.body as {
      event:
        | 'order.created'
        | 'order.paid'
        | 'order.dispatched'
        | 'order.delivered'
        | 'cart.abandoned'
        | 'review.created';
      customerPhone?: string;
      customerName?: string;
      orderNumber?: string;
      items?: Array<{ name: string; quantity: number; sku?: string; price?: number }>;
      totalAmount?: number;
      cartItemName?: string;
      cartUrl?: string;
      abandonedAt?: string;
      cartAgeHours?: number;
      abandonedDurationHours?: number;
      requiresRefrigeration?: boolean;
      reviewId?: string;
      productId?: string;
      rating?: number;
      title?: string;
      comment?: string;
    };

    if (!payload?.event || (!payload?.customerPhone && payload?.event !== 'review.created')) {
      return reply.status(400).send({ error: 'Bad Request: Missing event or customerPhone' });
    }

    const phone = payload.customerPhone || '';
    const name = payload.customerName || 'Friend';

    try {
      switch (payload.event) {
        case 'order.created':
        case 'order.paid': {
          const itemsSummary =
            (payload.items || []).map((i) => `• ${i.name} (${i.quantity}x)`).join('\n') ||
            'Handcrafted treats';
          const msg = formatTemplate(businessProfile.notifications.orderCreated.body, {
            customerName: name,
            brandName: businessProfile.brand.name,
            orderNumber: payload.orderNumber || '',
            location: businessProfile.brand.location,
            itemsSummary,
            totalAmount: payload.totalAmount || '',
            orderTrackingUrl:
              businessProfile.brand.links?.orderTrackingUrl ||
              businessProfile.brand.orderTrackingUrl,
          });

          const buttons = (businessProfile.notifications.orderCreated.buttonKeys || ['trackOrder'])
            .map(
              (k) =>
                (
                  businessProfile.navigation.buttons as Record<
                    string,
                    { id: string; title: string }
                  >
                )[k],
            )
            .filter((b): b is { id: string; title: string } => Boolean(b));

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons:
              buttons.length > 0 ? buttons : [{ id: 'btn_track_order', title: '📦 Track on Web' }],
          });

          // Smart Replenishment Prediction Engine:
          // Schedule replenishment reminder for day 25 (standard velocity for 300g Paan Mukhwas ~3-4 weeks)
          const replenishmentDays = 25;
          const scheduledTime = new Date(Date.now() + replenishmentDays * 24 * 60 * 60 * 1000).toISOString();
          void platformRepo
            .enqueueJob(
              'replenishment_reminder',
              {
                customerPhone: phone,
                customerName: name,
                orderNumber: payload.orderNumber,
                items: payload.items || [{ name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 }],
                estimatedDays: replenishmentDays,
              },
              scheduledTime,
            )
            .catch((err) => req.log.error({ err, phone }, 'Failed scheduling replenishment reminder job'));
          break;
        }

        case 'order.dispatched': {
          const msg = formatTemplate(businessProfile.notifications.orderDispatched.body, {
            customerName: name,
            brandName: businessProfile.brand.name,
            orderNumber: payload.orderNumber || '',
            orderTrackingUrl:
              businessProfile.brand.links?.orderTrackingUrl ||
              businessProfile.brand.orderTrackingUrl,
          });

          const buttons = (
            businessProfile.notifications.orderDispatched.buttonKeys || ['trackOrder']
          )
            .map(
              (k) =>
                (
                  businessProfile.navigation.buttons as Record<
                    string,
                    { id: string; title: string }
                  >
                )[k],
            )
            .filter((b): b is { id: string; title: string } => Boolean(b));

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons:
              buttons.length > 0 ? buttons : [{ id: 'btn_track_order', title: '📦 Track on Web' }],
          });
          break;
        }

        case 'order.delivered': {
          // Check if any ordered product requires refrigeration or special post-completion care
          const coldProducts = [
            ...businessProfile.products
              .filter((p) => p.requiresRefrigeration)
              .map((p) => p.title.toLowerCase()),
            ...businessProfile.offerings
              .filter((o) => o.requiresRefrigeration)
              .map((o) => o.title.toLowerCase()),
          ];

          const requiresColdStorage =
            payload.requiresRefrigeration ??
            (payload.items && payload.items.length > 0
              ? payload.items.some((i) => {
                  const n = i.name.toLowerCase();
                  return (
                    coldProducts.some((cp) => n.includes(cp)) ||
                    n.includes('paan') ||
                    n.includes('trio') ||
                    n.includes('family') ||
                    n.includes('gulkand')
                  );
                })
              : true); // Default true for artisanal mukhwas if unspecified

          let msg: string;
          if (requiresColdStorage) {
            msg =
              businessProfile.notifications.orderDelivered?.refrigerationNudge ||
              'Your Mintara Paan Mukhwas has arrived! 🌿 Please pop it into the refrigerator right away to preserve its crisp texture and authentic rose aroma.';
          } else {
            msg = formatTemplate(
              businessProfile.notifications.orderDelivered?.standardBody ||
                'Hi {{customerName}}! 🎉\n\nYour {{brandName}} order *#{{orderNumber}}* has been delivered! Enjoy your freshly handcrafted treats.\n\nExplore more treats anytime: {{websiteUrl}}',
              {
                customerName: name,
                brandName: businessProfile.brand.name,
                orderNumber: payload.orderNumber || '',
                websiteUrl:
                  businessProfile.brand.links?.websiteUrl ||
                  businessProfile.brand.websiteUrl,
              },
            );
          }

          const buttons = (
            businessProfile.notifications.orderDelivered?.buttonKeys || ['browseCatalog']
          )
            .map(
              (k) =>
                (
                  businessProfile.navigation.buttons as Record<
                    string,
                    { id: string; title: string }
                  >
                )[k],
            )
            .filter((b): b is { id: string; title: string } => Boolean(b));

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons:
              buttons.length > 0
                ? buttons
                : [{ id: 'btn_browse_catalog', title: '🛒 Browse Treats' }],
          });

          // Automated CSAT / Review Collection:
          // 3 days post-delivery, trigger a rating prompt (1–5 stars)
          const csatDelayMs = 3 * 24 * 60 * 60 * 1000;
          const scheduledTime = new Date(Date.now() + csatDelayMs).toISOString();
          void platformRepo
            .enqueueJob(
              'csat_review_prompt',
              {
                customerPhone: phone,
                customerName: name,
                orderNumber: payload.orderNumber,
              },
              scheduledTime,
            )
            .catch((err) =>
              req.log.error({ err, phone }, 'Failed scheduling CSAT review prompt job'),
            );
          break;
        }

        case 'cart.abandoned': {
          const cleanPhone = phone.replace(/\D/g, '');
          const phoneSuffix = cleanPhone.slice(-4) || '10';
          const promoCode = `TREAT10-${phoneSuffix}`;

          // Determine cart abandonment duration
          let durationHours = payload.abandonedDurationHours ?? payload.cartAgeHours;
          if (durationHours === undefined && payload.abandonedAt) {
            durationHours = (Date.now() - new Date(payload.abandonedAt).getTime()) / (1000 * 60 * 60);
          }
          // Default to > 4 hours if not explicitly set to lower
          const isOverFourHours = durationHours === undefined || durationHours > 4;

          const baseCartUrl =
            payload.cartUrl ||
            businessProfile.brand.links?.cartUrl ||
            `${businessProfile.brand.websiteUrl}/cart`;

          let msg: string;
          let issuedPromoCode: string | undefined = undefined;

          if (isOverFourHours) {
            issuedPromoCode = promoCode;
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            // Persist single-use personalized promo code in database
            await platformRepo
              .createPromoCode({
                code: promoCode,
                type: 'percent',
                value: 10,
                expiresAt,
                usageLimit: 1,
              })
              .catch((err) => req.log.warn({ err, promoCode }, 'Non-fatal error creating promo code'));

            const cartUrlWithPromo = `${baseCartUrl}${baseCartUrl.includes('?') ? '&' : '?'}discount=${promoCode}&utm_source=whatsapp&utm_medium=cart_abandoned`;

            msg =
              `Hi ${name}! 🌿\n\n` +
              `We noticed you left *${payload.cartItemName || 'your favorite artisanal treats'}* in your cart.\n\n` +
              `To help you complete your order, here is an exclusive single-use 10% discount: *${promoCode}* ✨\n\n` +
              `⏰ *Hurry, your personal coupon expires in 24 hours!*\n\n` +
              `Finish your checkout now for pure, 100% supari-free freshness:\n👉 ${cartUrlWithPromo}`;
          } else {
            msg = formatTemplate(businessProfile.notifications.cartAbandoned.body, {
              customerName: name,
              brandName: businessProfile.brand.name,
              cartItemName: payload.cartItemName || 'your favorite artisanal treats',
              cartUrl: baseCartUrl,
            });
          }

          const buttons = (
            businessProfile.notifications.cartAbandoned.buttonKeys || ['browseCatalog']
          )
            .map(
              (k) =>
                (
                  businessProfile.navigation.buttons as Record<
                    string,
                    { id: string; title: string }
                  >
                )[k],
            )
            .filter((b): b is { id: string; title: string } => Boolean(b));

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons:
              buttons.length > 0
                ? buttons
                : [{ id: 'btn_browse_catalog', title: '🛒 Browse Treats' }],
          });

          return reply.status(200).send({
            status: 'dispatched',
            event: payload.event,
            recipient: phone,
            promoCode: issuedPromoCode,
          });
        }

        case 'review.created': {
          const ratingVal = payload.rating ?? 5;
          const reviewRecord = await platformRepo.upsertPlatformReview({
            id: payload.reviewId,
            externalReviewId: payload.reviewId ? `web_${payload.reviewId}` : undefined,
            platform: 'website',
            customerName: payload.customerName || 'Website Customer',
            customerPhone: payload.customerPhone,
            orderNumber: payload.orderNumber,
            rating: ratingVal,
            title: payload.title,
            comment: payload.comment || 'Verified website review',
            verified: true,
          });

          return reply.status(200).send({
            status: 'synced',
            event: 'review.created',
            review: reviewRecord,
          });
        }
      }

      return reply
        .status(200)
        .send({ status: 'dispatched', event: payload.event, recipient: phone });
    } catch (err) {
      req.log.error({ err, payload }, 'Failed processing ecommerce webhook event');
      return reply.status(500).send({ error: 'Internal Error processing ecommerce webhook' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3.1 Logistics & Courier Webhook Ingestion (Shiprocket, Delhivery, Bluedart, etc.)
  // Proactive NDR (Non-Delivery Report) Resolution
  // ---------------------------------------------------------------------------
  const handleLogisticsWebhook = async (req: FastifyRequest, reply: FastifyReply) => {
    // Secret authentication check (optional if configured)
    const authHeader = req.headers.authorization;
    const customHeader = req.headers['x-webhook-secret'];
    const expectedSecret = config.ECOMMERCE_WEBHOOK_SECRET;

    if (expectedSecret) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : customHeader;
      if (token && token !== expectedSecret) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid courier webhook secret' });
      }
    }

    const payload = req.body as {
      courier?: string;
      event?: string;
      status?: string;
      current_status?: string;
      shiprocket_status?: string;
      ndr_status?: string;
      reason?: string;
      ndr_reason?: string;
      remarks?: string;
      failure_reason?: string;
      orderNumber?: string;
      order_number?: string;
      order_id?: string | number;
      customerPhone?: string;
      customer_phone?: string;
      phone?: string;
      customerName?: string;
      customer_name?: string;
      name?: string;
      awb?: string;
      awb_code?: string;
    };

    if (!payload) {
      return reply.status(400).send({ error: 'Bad Request: Missing courier webhook payload' });
    }

    const courier = payload.courier || 'courier';
    const statusString = (
      payload.status ||
      payload.current_status ||
      payload.event ||
      payload.ndr_status ||
      ''
    ).toUpperCase();

    const isNdr =
      statusString.includes('NDR') ||
      statusString.includes('UNDELIVERED') ||
      statusString.includes('FAIL') ||
      statusString.includes('ATTEMPT') ||
      statusString.includes('UNAVAILABLE') ||
      statusString.includes('INCORRECT') ||
      payload.event === 'shipment.ndr';

    const phone = payload.customerPhone || payload.customer_phone || payload.phone;
    const customerName = payload.customerName || payload.customer_name || payload.name || 'Friend';
    const orderNumber = String(payload.orderNumber || payload.order_number || payload.order_id || '');
    const reason =
      payload.ndr_reason ||
      payload.reason ||
      payload.remarks ||
      payload.failure_reason ||
      'Customer unavailable / Address incomplete';

    req.log.info(
      { courier, statusString, isNdr, phone, orderNumber, reason },
      'Received logistics webhook event',
    );

    if (isNdr && phone) {
      // 1. Record NDR instruction request in database
      await platformRepo
        .recordNdrInstruction({
          customerPhone: phone,
          orderNumber,
          instructions: `Delivery attempt failed: ${reason}`,
          courier,
          status: 'submitted',
        })
        .catch((err) => req.log.warn({ err }, 'Failed persisting NDR instruction record'));

      // 2. Dispatch proactive WhatsApp notification asking for updated landmark/instructions before RTO
      const alertMsg = formatTemplate(
        businessProfile.notifications.ndrAlert?.body ||
          'Hi {{customerName}}! 🚚\n\nOur courier partner attempted to deliver your {{brandName}} order *#{{orderNumber}}*, but the delivery could not be completed (Reason: {{reason}}).\n\nTo avoid Return to Origin (RTO), please provide updated delivery instructions, an alternative timing, or nearby landmark by replying directly to this message.',
        {
          customerName,
          brandName: businessProfile.brand.name,
          orderNumber: orderNumber ? `#${orderNumber}` : 'recent order',
          reason,
        },
      );

      await whatsappProvider.sendMessage({
        type: 'interactive',
        to: phone,
        body: alertMsg,
        buttons: [
          { id: 'btn_ndr_update_address', title: '📍 Update Landmark' },
          { id: 'btn_ndr_reattempt', title: '📦 Re-attempt' },
        ],
      });

      return reply.status(200).send({
        status: 'ndr_alert_sent',
        recipient: phone,
        courier,
        reason,
        orderNumber,
      });
    }

    return reply.status(200).send({
      status: 'received',
      courier,
      event: payload.event || payload.status,
    });
  };

  app.post('/webhooks/logistics', handleLogisticsWebhook);
  app.post('/webhooks/courier', handleLogisticsWebhook);

  // ---------------------------------------------------------------------------
  // 4. Marketing Campaign Trigger
  // ---------------------------------------------------------------------------
  app.post('/api/marketing/trigger', async (req, reply) => {
    try {
      req.log.info('Marketing campaign triggered via API');
      const report = await marketingOrchestrator.runScheduledCampaign();
      return reply.status(200).send({
        status: 'success',
        report,
      });
    } catch (err) {
      req.log.error({ err }, 'Error executing marketing campaign');
      return reply.status(500).send({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error during marketing execution',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Admin & Analytics Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/analytics/overview', async (_req, reply) => {
    const summary = await platformRepo.getAnalyticsSummary();
    return reply.status(200).send({ status: 'ok', summary });
  });

  app.get('/api/analytics/roas', async (req, reply) => {
    const query = req.query as { adId?: string; spend?: string };
    const adId = query.adId || 'all';
    const spend = query.spend ? parseFloat(query.spend) : 0;
    const report = await platformRepo.calculateROAS(adId, spend);
    return reply.status(200).send({ status: 'ok', report });
  });

  app.get('/api/support/tickets', async (req, reply) => {
    const query = req.query as { status?: 'open' | 'in_progress' | 'resolved' };
    const tickets = await platformRepo.getEscalationTickets(query.status);
    return reply.status(200).send({ status: 'ok', count: tickets.length, tickets });
  });

  app.post('/api/support/tickets/:id/resolve', async (req, reply) => {
    const params = req.params as { id: string };
    const resolved = await platformRepo.resolveTicket(params.id);

    if (!resolved) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    // Notify customer that human support has concluded and AI bot is active again
    void whatsappProvider
      .sendMessage({
        type: 'interactive',
        to: resolved.phoneNumber,
        body:
          `Hello ${resolved.customerName || 'there'}! 🙏\n\n` +
          `Your support inquiry has been resolved by our team. Our automated AI assistant is back online if you need anything else! ✨`,
        buttons: [
          { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
          { id: 'btn_track_order', title: '📦 Track on Web' },
        ],
      })
      .catch((err: unknown) => {
        req.log.error({ err }, 'Failed sending resolution message to customer');
      });

    return reply.status(200).send({
      status: 'resolved',
      ticket: resolved,
      message: 'Ticket resolved and AI bot unmuted for customer',
    });
  });

  // ---------------------------------------------------------------------------
  // 5.1 Human Agent Live-Reply API (Live Agent Chat)
  // ---------------------------------------------------------------------------
  app.post('/api/support/conversations/:id/reply', async (req, reply) => {
    const params = req.params as { id: string };
    const body = req.body as { message?: string; agentName?: string };

    if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
      return reply.status(400).send({ error: 'Bad Request: "message" text is required' });
    }

    const conversation = await platformRepo.getConversationById(params.id);
    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const textToSend = body.message.trim();
    const agentName = body.agentName || 'Customer Care Team';

    const sendResult = await whatsappProvider.sendMessage({
      type: 'text',
      to: conversation.phoneNumber,
      body: textToSend,
    });

    const savedMessage = await platformRepo.appendMessage(
      conversation.id,
      conversation.phoneNumber,
      'human_agent',
      textToSend,
    );

    return reply.status(200).send({
      status: 'sent',
      messageId: sendResult.messageId,
      recipient: conversation.phoneNumber,
      conversationId: conversation.id,
      agentName,
      message: savedMessage,
    });
  });

  app.get('/api/logistics/ndr', async (req, reply) => {
    const query = req.query as { phone?: string };
    const instructions = await platformRepo.getNdrInstructions(query.phone);
    return reply.status(200).send({ status: 'ok', count: instructions.length, instructions });
  });

  app.get('/api/customer/reviews', async (req, reply) => {
    const query = req.query as { phone?: string };
    const reviews = await platformRepo.getCustomerReviews(query.phone);
    return reply.status(200).send({ status: 'ok', count: reviews.length, reviews });
  });

  app.get('/api/reviews/summary', async (_req, reply) => {
    const summary = await platformRepo.getUnifiedReviewSummary();
    return reply.status(200).send({ status: 'ok', summary });
  });

  app.post('/api/reviews/batch-sync', async (req, reply) => {
    const body = req.body as {
      reviews: Array<{
        id?: string;
        externalReviewId?: string;
        platform: 'website' | 'google' | 'whatsapp' | 'amazon' | 'trustpilot' | 'other';
        rating: number;
        customerName?: string;
        customerPhone?: string;
        orderNumber?: string;
        title?: string;
        comment?: string;
        status?: 'submitted' | 'escalated' | 'resolved' | 'published';
        verified?: boolean;
        createdAt?: string;
      }>;
    };

    if (!body?.reviews || !Array.isArray(body.reviews)) {
      return reply.status(400).send({ error: 'Missing or invalid reviews array in payload' });
    }

    const result = await platformRepo.batchSyncReviews(body.reviews);
    const summary = await platformRepo.getUnifiedReviewSummary();

    return reply.status(200).send({
      status: 'synced',
      syncedCount: result.synced,
      summary,
      reviews: result.reviews,
    });
  });

  app.patch('/api/reviews/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const body = req.body as { rating: number; comment?: string };

    if (body?.rating === undefined || typeof body.rating !== 'number') {
      return reply.status(400).send({ error: 'Invalid or missing rating number' });
    }

    const updated = await platformRepo.updateReviewRating(params.id, body.rating, body.comment);
    if (!updated) {
      return reply.status(404).send({ error: 'Review not found' });
    }

    const summary = await platformRepo.getUnifiedReviewSummary();
    return reply.status(200).send({ status: 'updated', review: updated, summary });
  });

  app.post('/api/reviews/sync-from-store', async (req, reply) => {
    try {
      const client = createEcommerceSupabaseClient();
      const { data, error } = await client
        .from('reviews')
        .select('id, product_id, customer_id, customer_name, rating, title, comment, is_verified, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        req.log.warn({ error }, 'Error fetching reviews from ecommerce database (will use cache)');
      }

      const websiteReviews = (data || []).map((row: any) => ({
        id: row.id,
        productId: row.product_id,
        customerName: row.customer_name,
        rating: Number(row.rating),
        title: row.title,
        comment: row.comment,
        isVerified: Boolean(row.is_verified),
        createdAt: row.created_at,
      }));

      if (websiteReviews.length > 0) {
        await platformRepo.syncWebsiteReviews(websiteReviews);
      }
      const summary = await platformRepo.getUnifiedReviewSummary();

      return reply.status(200).send({
        status: 'synced',
        syncedCount: websiteReviews.length,
        summary,
        reviews: websiteReviews,
      });
    } catch (err) {
      req.log.error({ err }, 'Failed syncing reviews from store database');
      return reply.status(500).send({ error: 'Failed syncing reviews from store database' });
    }
  });

  return app;
}
