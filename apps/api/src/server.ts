import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import { getConfig } from '@whatsapp-platform/config';
import {
  checkLocalDbHealth,
  DbHealthResult,
  getPlatformRepository,
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
      service: 'mintara-bites-whatsapp-platform',
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

    if (mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
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

    // Immediately acknowledge Meta
    reply.status(200).send({ status: 'received' });

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

                let messageBody = '';
                let buttonId: string | undefined;

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
                }

                if (messageBody || buttonId) {
                  void supportOrchestrator
                    .processMessage({
                      from: message.from,
                      messageId: message.id,
                      body: messageBody,
                      senderName,
                      timestamp: message.timestamp,
                      interactiveButtonId: buttonId,
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
      event: 'order.created' | 'order.paid' | 'order.dispatched' | 'cart.abandoned';
      customerPhone: string;
      customerName?: string;
      orderNumber?: string;
      items?: Array<{ name: string; quantity: number }>;
      totalAmount?: number;
      cartItemName?: string;
    };

    if (!payload?.event || !payload?.customerPhone) {
      return reply.status(400).send({ error: 'Bad Request: Missing event or customerPhone' });
    }

    const phone = payload.customerPhone;
    const name = payload.customerName || 'Friend';

    try {
      switch (payload.event) {
        case 'order.created':
        case 'order.paid': {
          const itemsSummary =
            (payload.items || []).map((i) => `• ${i.name} (${i.quantity}x)`).join('\n') ||
            'Mukhwas treats';
          const msg =
            `Hi ${name}! 🎉\n\n` +
            `Thank you for your order *#${payload.orderNumber || ''}* at Mintara Bites! We're handcrafting your 100% supari-free treats with love in Surat, Gujarat.\n\n` +
            `*Ordered Items:*\n${itemsSummary}\n\n` +
            `*Total:* ₹${payload.totalAmount || ''}\n\n` +
            `Track your order status anytime here: https://mintarabites.com/account/orders`;

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons: [
              { id: 'btn_track_order', title: '📦 Track on Web' },
              { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
            ],
          });
          break;
        }

        case 'order.dispatched': {
          const msg =
            `Hi ${name}! 🚚\n\n` +
            `Exciting news! Your Mintara Bites order *#${payload.orderNumber || ''}* has been freshly packed and handed to our courier partner!\n\n` +
            `Track live courier updates directly on your dashboard:\n` +
            `👉 https://mintarabites.com/account/orders`;

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons: [
              { id: 'btn_track_order', title: '📦 Track on Web' },
              { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
            ],
          });
          break;
        }

        case 'cart.abandoned': {
          const msg =
            `Hi ${name}! 🌿\n\n` +
            `We noticed you left *${payload.cartItemName || 'your favorite artisanal treats'}* in your cart.\n\n` +
            `Your cart is reserved! Finish your checkout now for pure, 100% supari-free freshness:\n` +
            `👉 https://mintarabites.com/cart`;

          await whatsappProvider.sendMessage({
            type: 'interactive',
            to: phone,
            body: msg,
            buttons: [
              { id: 'btn_browse_catalog', title: '🛒 Browse Treats' },
              { id: 'btn_talk_human', title: '🙋 Talk to Agent' },
            ],
          });
          break;
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

  return app;
}
