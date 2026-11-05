import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import { getConfig } from '@whatsapp-platform/config';
import { checkLocalDbHealth, DbHealthResult } from '@whatsapp-platform/database';
import { AppError } from '@whatsapp-platform/shared';
import { SupportOrchestrator } from '@whatsapp-platform/support-engine';
import { MarketingOrchestrator } from '@whatsapp-platform/marketing-engine';

export interface ServerOptions {
  dbHealthChecker?: () => Promise<DbHealthResult>;
  disableRequestLogging?: boolean;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = getConfig();

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
            'password',
            'token',
            'secret',
          ],
        },
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
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
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

      // In production, do not leak unexpected 500 error messages
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

  // Liveness Check: Reports process is running
  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'whatsapp-platform-api',
    });
  });

  // Readiness Check: Validates required configuration and local database connectivity
  app.get('/ready', async (req, reply) => {
    const healthChecker = options.dbHealthChecker || checkLocalDbHealth;

    try {
      // 1. Configuration check (guaranteed non-null if we got here)
      // 2. Local Database check
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
        error: 'Local database connectivity check failed',
      });
    }
  });

  const supportOrchestrator = new SupportOrchestrator();
  const marketingOrchestrator = new MarketingOrchestrator();

  // WhatsApp Webhook Verification (Meta Handshake)
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      req.log.info('Meta WhatsApp webhook verification successful');
      return reply.status(200).send(challenge);
    }

    req.log.warn({ mode, tokenReceived: Boolean(token) }, 'Meta WhatsApp webhook verification rejected');
    return reply.status(403).send('Forbidden: Token mismatch');
  });

  // WhatsApp Inbound Webhook (Customer messages and status updates)
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const body = req.body as any;

    // Immediately acknowledge Meta to prevent timeout/retries
    reply.status(200).send({ status: 'received' });

    try {
      if (body?.object === 'whatsapp_business_account' && Array.isArray(body?.entry)) {
        for (const entry of body.entry) {
          const changes = entry.changes || [];
          for (const change of changes) {
            const value = change.value;
            if (value?.messaging_product === 'whatsapp' && Array.isArray(value?.messages)) {
              for (const message of value.messages) {
                if (message.type === 'text' && message.text?.body) {
                  const contact = value.contacts?.[0];
                  const senderName = contact?.profile?.name;

                  // Process asynchronously through Support Engine
                  void supportOrchestrator.processMessage({
                    from: message.from,
                    messageId: message.id,
                    body: message.text.body,
                    senderName,
                    timestamp: message.timestamp,
                  }).catch((err) => {
                    req.log.error({ err, messageId: message.id }, 'Error in support orchestrator processMessage');
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

  // Manual or Scheduled Marketing Campaign Trigger
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

  return app;
}
