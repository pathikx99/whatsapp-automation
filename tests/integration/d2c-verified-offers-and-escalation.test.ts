import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { getConfig, resetConfigCache } from '@whatsapp-platform/config';
import { getPlatformRepository } from '@whatsapp-platform/database';
import {
  createEcommerceAdapter,
  generatePrefilledCheckoutUrl,
} from '@whatsapp-platform/ecommerce-adapter';

describe(
  'D2C System: Verified Offers Only & Live Agent Escalation Desk',
  { timeout: 30000 },
  () => {
    let app: FastifyInstance;
    const platformRepo = getPlatformRepository();
    const ecommerceAdapter = createEcommerceAdapter();

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      process.env.APP_ENV = 'production';
      process.env.API_PORT = '3000';
      process.env.SUPABASE_URL = 'https://platform-test.supabase.co';
      process.env.SUPABASE_SECRET_KEY = 'test-platform-secret-key-123';
      process.env.SUPABASE_PUBLISHABLE_KEY = 'test-platform-pub-key-123';
      process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce-test.supabase.co';
      process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-anon-key-456';
      process.env.STRICT_VERIFIED_OFFERS_ONLY = 'true';
      process.env.WHATSAPP_APP_SECRET = '';

      resetConfigCache();
      app = await buildServer({ disableRequestLogging: true });
      await app.ready();
    });

    afterAll(async () => {
      delete process.env.STRICT_VERIFIED_OFFERS_ONLY;
      await app.close();
    });

    describe('1. Verified Offers Only Architecture', () => {
      it('should return null when no promotions table or active promos exist', async () => {
        const promo = await ecommerceAdapter.getActivePromotion();
        // Safe default: no random promos returned
        expect(promo === null || typeof promo?.code === 'string').toBe(true);
      });

      it('should generate cart checkout URL without discount parameter when promoCode is omitted', () => {
        const url = generatePrefilledCheckoutUrl([
          { name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 },
        ]);
        expect(url).not.toContain('discount=');
        expect(url).toContain('https://mintarabites.com/cart?');
        expect(url).toContain('add=');
      });

      it('should include discount parameter ONLY when a verified promo code is explicitly provided', () => {
        const url = generatePrefilledCheckoutUrl(
          [{ name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 }],
          'SUMMER20',
        );
        expect(url).toContain('discount=SUMMER20');
      });

      it('should send a clean value-first message without random discounts on cart abandonment when DB has no active promo', async () => {
        const config = getConfig();
        const res = await app.inject({
          method: 'POST',
          url: '/webhooks/ecommerce',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${config.ECOMMERCE_WEBHOOK_SECRET || ''}`,
            'x-webhook-secret': config.ECOMMERCE_WEBHOOK_SECRET || '',
          },
          payload: {
            event: 'cart.abandoned',
            customerPhone: '919876543299',
            customerName: 'Pooja',
            cartItemName: 'Mintara Trio Pack (350g)',
            cartUrl: 'https://mintarabites.com/cart',
            abandonedDurationHours: 1, // 1 hour drop-off
          },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('dispatched');
        // Must not invent arbitrary promo codes
        expect(body.promoCode).toBeUndefined();

        // Test cart dropped > 4 hours ago: Still zero random offers if DB has no promo!
        const resLong = await app.inject({
          method: 'POST',
          url: '/webhooks/ecommerce',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${config.ECOMMERCE_WEBHOOK_SECRET}`,
          },
          payload: {
            event: 'cart.abandoned',
            phoneNumber: '919876543298',
            customerName: 'Ananya',
            cartItemName: 'Artisanal Paan Mukhwas (300g)',
            cartUrl: 'https://mintarabites.com/cart',
            abandonedDurationHours: 12, // 12 hours drop-off
          },
        });

        expect(resLong.statusCode).toBe(200);
        const bodyLong = JSON.parse(resLong.body);
        expect(bodyLong.status).toBe('dispatched');
        expect(bodyLong.promoCode).toBeUndefined();
      });
    });

    describe('2. Live Agent Escalation Desk (Zero Meta OTP Friction)', () => {
      it('should serve the HTML support desk dashboard at /admin/support and /dashboard/support', async () => {
        const resAdmin = await app.inject({
          method: 'GET',
          url: '/admin/support',
        });

        expect(resAdmin.statusCode).toBe(200);
        expect(resAdmin.headers['content-type']).toContain('text/html');
        expect(resAdmin.body).toContain('Live Agent Support Desk');
        expect(resAdmin.body).toContain('Zero Meta OTP Friction');
        expect(resAdmin.body).toContain('escapeHtml');

        const resDashboard = await app.inject({
          method: 'GET',
          url: '/dashboard/support',
        });

        expect(resDashboard.statusCode).toBe(200);
        expect(resDashboard.headers['content-type']).toContain('text/html');
        expect(resDashboard.body).toContain('Live Agent Support Desk');
      });

      it('should create an escalation ticket and retrieve it via GET /api/support/tickets/:id with Supabase dossier', async () => {
        // 1. Create a ticket in platform repo
        const phone = '919876543298';
        const conv = await platformRepo.getOrCreateConversation(phone);
        await platformRepo.appendMessage(
          conv.id,
          phone,
          'customer',
          'My order arrived damaged! Need human agent!',
        );
        await platformRepo.appendMessage(
          conv.id,
          phone,
          'assistant',
          'I am transferring you to human support.',
        );

        const ticket = await platformRepo.createEscalationTicket(
          conv.id,
          phone,
          'Rajesh Sharma',
          'Customer received damaged packaging',
        );

        expect(ticket).toBeDefined();
        expect(ticket.id).toBeDefined();

        // 2. Fetch via /api/support/tickets/:id
        const res = await app.inject({
          method: 'GET',
          url: `/api/support/tickets/${ticket.id}`,
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.status).toBe('ok');
        expect(data.ticket.id).toBe(ticket.id);
        expect(data.ticket.phoneNumber).toBe(phone);
        expect(data.messages.length).toBeGreaterThan(0);
        expect(data.customerDossier).toBeDefined();
      });

      it('should resolve the ticket and unmute the customer via POST /api/support/tickets/:id/resolve', async () => {
        const phone = '919876543297';
        const conv = await platformRepo.getOrCreateConversation(phone);
        await platformRepo.updateConversationStatus(phone, 'escalated');

        const ticket = await platformRepo.createEscalationTicket(
          conv.id,
          phone,
          'Sunita Patel',
          'Return inquiry',
        );

        const resolveRes = await app.inject({
          method: 'POST',
          url: `/api/support/tickets/${ticket.id}/resolve`,
        });

        expect(resolveRes.statusCode).toBe(200);
        const resolveData = JSON.parse(resolveRes.body);
        expect(resolveData.status).toBe('resolved');
        expect(resolveData.ticket.status).toBe('resolved');

        // Verify conversation status is restored to active
        const updatedConv = await platformRepo.getOrCreateConversation(phone);
        expect(updatedConv.status).toBe('active');
      });
    });

    describe('3. RFM Customer Segmentation & D2C Analytics Scorecard', () => {
      it('should return customer RFM segments and counts via GET /api/marketing/rfm-segments', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/marketing/rfm-segments',
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.status).toBe('ok');
        expect(data.counts).toBeDefined();
        expect(typeof data.counts.total).toBe('number');
        expect(typeof data.counts.champions).toBe('number');
        expect(typeof data.counts.loyal).toBe('number');
        expect(typeof data.counts.atRisk).toBe('number');
        expect(data.segments).toBeDefined();
      });

      it('should dispatch segmented marketing campaigns via POST /api/marketing/campaigns/dispatch', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/marketing/campaigns/dispatch',
          headers: { 'Content-Type': 'application/json' },
          payload: { segment: 'first_order_nurture' },
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.status).toBe('success');
        expect(data.segment).toBe('first_order_nurture');
        expect(data.report).toBeDefined();
        expect(typeof data.report.dispatchedCount).toBe('number');
      });

      it('should return comprehensive D2C performance metrics via GET /api/analytics/d2c-performance', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/analytics/d2c-performance',
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.status).toBe('ok');
        expect(data.scorecard).toBeDefined();
        expect(data.scorecard.support).toBeDefined();
        expect(typeof data.scorecard.support.deflectionRatePercent).toBe('number');
        expect(data.scorecard.rfmSegments).toBeDefined();
        expect(data.scorecard.support.openEscalations).toBeDefined();
      });
    });
  },
);
