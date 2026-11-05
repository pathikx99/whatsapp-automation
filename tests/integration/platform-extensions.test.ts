import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';
import { getPlatformRepository } from '@whatsapp-platform/database';
import { processSingleJob } from '../../apps/worker/src/index.js';

describe('Platform Extensions (Webhooks, Tickets, Analytics & Worker)', () => {
  let app: FastifyInstance;
  const platformRepo = getPlatformRepository();
  const testSecret = 'test_webhook_app_secret_123';
  const ecommerceSecret = 'test_ecommerce_secret_456';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'production';
    process.env.API_PORT = '3000';
    process.env.SUPABASE_URL = 'https://platform-test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-platform-secret-key-123';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-platform-pub-key-123';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce-test.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-anon-key-456';
    process.env.WHATSAPP_APP_SECRET = testSecret;
    process.env.ECOMMERCE_WEBHOOK_SECRET = ecommerceSecret;

    resetConfigCache();
    app = await buildServer({ disableRequestLogging: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Meta Webhook HMAC-SHA256 Signature Verification', () => {
    it('should reject requests with invalid HMAC signatures', async () => {
      const payload = { object: 'whatsapp_business_account', entry: [] };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'x-hub-signature-256': 'sha256=invalid_forged_hash',
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });

    it('should accept requests with valid HMAC-SHA256 signatures', async () => {
      const payload = { object: 'whatsapp_business_account', entry: [] };
      const rawPayload = JSON.stringify(payload);
      const hash = crypto.createHmac('sha256', testSecret).update(rawPayload).digest('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'x-hub-signature-256': `sha256=${hash}`,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('received');
    });
  });

  describe('Ecommerce Webhook Ingestion (/webhooks/ecommerce)', () => {
    it('should reject unauthorized webhook calls when secret is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: 'Bearer wrong-secret',
        },
        payload: {
          event: 'order.created',
          customerPhone: '919876543210',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle order.created and return dispatched status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: `Bearer ${ecommerceSecret}`,
        },
        payload: {
          event: 'order.created',
          customerPhone: '919876543210',
          customerName: 'Priya',
          orderNumber: 'MB-1001',
          items: [{ name: 'Paan Mukhwas (200g)', quantity: 2 }],
          totalAmount: 499,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('dispatched');
      expect(body.event).toBe('order.created');
    });

    it('should handle cart.abandoned recovery event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: `Bearer ${ecommerceSecret}`,
        },
        payload: {
          event: 'cart.abandoned',
          customerPhone: '919876543210',
          customerName: 'Priya',
          cartItemName: 'Seeds Fusion Lime',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).event).toBe('cart.abandoned');
    });
  });

  describe('Admin Tickets & Analytics Endpoints', () => {
    it('GET /api/analytics/overview should return metrics object', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/overview',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.summary).toBeDefined();
      expect(typeof body.summary.activeConversations).toBe('number');
    });

    it('should list and resolve escalation tickets via admin endpoints', async () => {
      // 1. Create a ticket in platform repo
      const ticket = await platformRepo.createEscalationTicket(
        'conv_test_123',
        '919111122222',
        'Rohan',
        'Customer requested supervisor',
      );
      expect(ticket.status).toBe('open');

      // 2. Query tickets via GET
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/support/tickets',
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = JSON.parse(listResponse.body);
      expect(listBody.tickets.some((t: any) => t.id === ticket.id)).toBe(true);

      // 3. Resolve ticket via POST
      const resolveResponse = await app.inject({
        method: 'POST',
        url: `/api/support/tickets/${ticket.id}/resolve`,
      });
      expect(resolveResponse.statusCode).toBe(200);
      const resolveBody = JSON.parse(resolveResponse.body);
      expect(resolveBody.ticket.status).toBe('resolved');

      // 4. Verify conversation status was restored to 'active'
      const conv = await platformRepo.getOrCreateConversation('919111122222');
      expect(conv.status).toBe('active');
    });
  });

  describe('Worker Queue Processing', () => {
    it('should enqueue and successfully process a worker job', async () => {
      const job = await platformRepo.enqueueJob('send_whatsapp', {
        type: 'text',
        to: '919876543210',
        body: 'Automated queue test message',
      });

      expect(job.status).toBe('pending');
      await processSingleJob(job);
      expect(job.status).toBe('completed');
    });
  });
});
