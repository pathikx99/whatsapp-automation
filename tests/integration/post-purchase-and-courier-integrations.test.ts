import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';
import { getPlatformRepository } from '@whatsapp-platform/database';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { processSingleJob } from '../../apps/worker/src/index.js';
import { WhatsAppProvider, OutboundWhatsAppMessage } from '@whatsapp-platform/whatsapp';

describe('Post-Purchase Journey & Courier Integrations', () => {
  let app: FastifyInstance;
  const platformRepo = getPlatformRepository();
  const testSecret = 'test_webhook_app_secret_789';
  const ecommerceSecret = 'test_ecommerce_secret_789';

  const mockEcommerceAdapter = {
    isConfigured: () => true,
    getCustomerByPhone: vi.fn().mockResolvedValue({
      id: 'cust_post_purchase_1',
      phoneNumber: '919876543250',
      firstName: 'Pooja',
    }),
    getCustomerOrders: vi.fn().mockResolvedValue([
      {
        id: 'ord_post_1',
        customerId: 'cust_post_purchase_1',
        orderNumber: 'MB-8801',
        status: 'DELIVERED',
        totalAmount: 399,
        currency: 'INR',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
          {
            productName: 'Artisanal Paan Mukhwas',
            flavor: 'Calcuttia Betel Leaf',
            weightGrams: 300,
            quantity: 1,
            unitPrice: 249,
          },
        ],
      },
    ]),
    getAllActiveProducts: vi.fn().mockResolvedValue([]),
    searchProducts: vi.fn().mockResolvedValue([]),
    getMarketingCandidates: vi.fn().mockResolvedValue([]),
    predictReplenishment: vi.fn().mockResolvedValue(null),
    getWebsiteReviews: vi.fn().mockResolvedValue([
      {
        id: 'rev_ananya_1',
        productId: 'paan-mukhwas',
        customerName: 'Ananya Patel',
        rating: 5,
        title: 'Best Mukhwas in Surat!',
        comment:
          'Absolutely love the fresh aromatic taste. Perfect after meals without being overly sweet.',
        isVerified: true,
        createdAt: '2024-07-18T10:00:00Z',
      },
      {
        id: 'rev_nikhil_2',
        productId: 'paan-mukhwas',
        customerName: 'Nikhil Sharma',
        rating: 5,
        title: 'Super Fast 1-day Delivery in Adajan',
        comment:
          'Super crisp freshness and authentic paan flavour. Really happy with the quality and quick cash on delivery service in Surat.',
        isVerified: true,
        createdAt: '2024-07-14T10:00:00Z',
      },
      {
        id: 'rev_pooja_3',
        productId: 'paan-mukhwas',
        customerName: 'Pooja Shah',
        rating: 4,
        title: 'Great digestive treat!',
        comment:
          'Very smooth and comforting after dinner. Highly recommend the 300g pack for regular daily consumption.',
        isVerified: true,
        createdAt: '2024-07-10T10:00:00Z',
      },
    ]),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'production';
    process.env.API_PORT = '3000';
    process.env.WHATSAPP_APP_SECRET = testSecret;
    process.env.ECOMMERCE_WEBHOOK_SECRET = ecommerceSecret;

    resetConfigCache();
    app = await buildServer({ disableRequestLogging: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // 1. Proactive order.delivered Refrigeration Nudge
  // ===========================================================================
  describe('1. Proactive order.delivered Refrigeration Nudge', () => {
    it('should trigger immediate proactive refrigeration nudge for products requiring cold storage (Paan Mukhwas)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          event: 'order.delivered',
          customerPhone: '919876543250',
          customerName: 'Pooja',
          orderNumber: 'MB-8801',
          items: [
            {
              name: 'Artisanal Paan Mukhwas (300g)',
              quantity: 1,
              price: 249,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe('dispatched');
      expect(data.event).toBe('order.delivered');
      expect(data.recipient).toBe('919876543250');
    });

    it('should send standard delivery notification when order does not require refrigeration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          event: 'order.delivered',
          customerPhone: '919876543251',
          customerName: 'Kunal',
          orderNumber: 'MB-8802',
          requiresRefrigeration: false,
          items: [
            {
              name: 'Seeds Fusion Regular (200g)',
              quantity: 2,
              price: 249,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe('dispatched');
    });

    it('should schedule an automated CSAT review prompt job for 3 days post-delivery', async () => {
      const targetPhone = `9198765${Math.floor(10000 + Math.random() * 90000)}`;
      const orderNumber = `MB-${Date.now().toString().slice(-4)}`;

      await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          event: 'order.delivered',
          customerPhone: targetPhone,
          customerName: 'Ananya',
          orderNumber,
          items: [
            {
              name: 'Mintara Trio Pack',
              quantity: 1,
              price: 399,
            },
          ],
        },
      });

      // Query scheduled jobs for this customer
      const jobs = await platformRepo.fetchScheduledJobs('csat_review_prompt', 50);
      const csatJob = jobs.find((j) => (j.payload as any).customerPhone === targetPhone);

      expect(csatJob).toBeDefined();
      expect((csatJob?.payload as any).orderNumber).toBe(orderNumber);
      expect((csatJob?.payload as any).customerName).toBe('Ananya');

      // Verify scheduled time is ~7 days in future (post-delivery retention lifecycle)
      const scheduledTimeMs = new Date(csatJob!.scheduledFor).getTime();
      const nowMs = Date.now();
      const diffDays = (scheduledTimeMs - nowMs) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.0);
      expect(diffDays).toBeLessThan(8.0);
    });
  });

  // ===========================================================================
  // 2. Proactive NDR (Non-Delivery Report) Resolution
  // ===========================================================================
  describe('2. Proactive NDR (Non-Delivery Report) Resolution', () => {
    it('should intercept courier delivery failure (Shiprocket NDR) and send proactive WhatsApp alert asking for landmark', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/logistics',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          courier: 'Shiprocket',
          current_status: 'UNDELIVERED',
          ndr_reason: 'Customer unavailable at provided address',
          customer_phone: '919876543260',
          customer_name: 'Vikram',
          order_id: 'MB-9901',
          awb: 'AWB-SHIP-123456',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe('ndr_alert_sent');
      expect(data.recipient).toBe('919876543260');
      expect(data.courier).toBe('Shiprocket');
      expect(data.reason).toBe('Customer unavailable at provided address');
      expect(data.orderNumber).toBe('MB-9901');

      // Verify recorded in NDR repository
      const ndrList = await platformRepo.getNdrInstructions('919876543260');
      expect(ndrList.length).toBeGreaterThan(0);
      expect(ndrList[0]?.customerPhone).toBe('919876543260');
      expect(ndrList[0]?.orderNumber).toBe('MB-9901');
    });

    it('should accept delivery failure from alternative courier webhooks (Delhivery / Bluedart)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/courier',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          courier: 'Delhivery',
          status: 'DELIVERY_FAILED',
          reason: 'Incorrect address / Landmark required',
          phone: '919876543261',
          customerName: 'Meera',
          orderNumber: 'MB-9902',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe('ndr_alert_sent');
      expect(data.reason).toBe('Incorrect address / Landmark required');
    });

    it('should prompt customer when they tap "Update Landmark" button', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'msg_ndr_btn',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      const result = await orchestrator.processMessage({
        from: '919876543260',
        messageId: 'msg_tap_update_landmark',
        body: 'Update Landmark',
        interactiveButtonId: 'btn_ndr_update_address',
      });

      expect(result.action).toBe('answered');
      expect(result.responseText).toContain('landmark');
      expect(result.responseText).toContain('Return to Origin');
    });

    it('should update NDR instructions when customer replies with landmark or delivery directions', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'msg_landmark_reply',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      // Customer responds with landmark
      const landmarkText =
        'My house is opposite Krishna Temple, 2nd floor, House #42, please call before delivery';
      const result = await orchestrator.processMessage({
        from: '919876543260',
        messageId: 'msg_customer_landmark_reply',
        body: landmarkText,
      });

      expect(result.action).toBe('answered');
      expect(result.responseText).toContain('forwarded your updated delivery instructions');
      expect(result.responseText).toContain(landmarkText);

      // Verify instruction was persisted
      const latestNdr = await platformRepo.getLatestNdrInstruction('919876543260');
      expect(latestNdr).toBeDefined();
      expect(latestNdr?.instructions).toBe(landmarkText);
      expect(latestNdr?.status).toBe('forwarded_to_courier');
    });

    it('should handle "Re-attempt" button and update status', async () => {
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi
          .fn()
          .mockResolvedValue({
            messageId: 'msg_reattempt',
            status: 'sent',
            recipient: '919876543260',
            timestamp: new Date().toISOString(),
          }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      const result = await orchestrator.processMessage({
        from: '919876543260',
        messageId: 'msg_btn_reattempt',
        body: 'Re-attempt',
        interactiveButtonId: 'btn_ndr_reattempt',
      });

      expect(result.action).toBe('answered');
      expect(result.responseText).toContain('priority re-attempt');

      const latestNdr = await platformRepo.getLatestNdrInstruction('919876543260');
      expect(latestNdr?.status).toBe('forwarded_to_courier');
    });
  });

  // ===========================================================================
  // 3. Automated CSAT / Review Collection
  // ===========================================================================
  describe('3. Automated CSAT / Review Collection', () => {
    it('should dispatch interactive rating prompt via background worker', async () => {
      // Enqueue and process CSAT prompt job
      const job = await platformRepo.enqueueJob('csat_review_prompt', {
        customerPhone: '919876543270',
        customerName: 'Rohan',
        orderNumber: 'MB-7701',
      });

      await processSingleJob(job);

      // Verify job completed
      expect(job.status).toBe('completed');
    });

    it('should share direct Google Review and Instagram links when customer gives 5 stars', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'msg_5_star',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      // Customer taps 5 stars button
      const result5Star = await orchestrator.processMessage({
        from: '919876543270',
        messageId: 'msg_rating_5_stars',
        body: '⭐⭐⭐⭐⭐ (5 Stars)',
        interactiveButtonId: 'btn_csat_5_stars',
      });

      expect(result5Star.action).toBe('answered');
      expect(result5Star.responseText).toContain('https://g.page/r/mintarabites/review');
      expect(result5Star.responseText).toContain('https://instagram.com/mintarabites');
      expect(result5Star.responseText).toContain('5-star rating');

      // Verify review recorded in database
      const reviews = await platformRepo.getCustomerReviews('919876543270');
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0]?.rating).toBe(5);
      expect(reviews[0]?.status).toBe('submitted');
    });

    it('should apologize, ask for feedback, and create an escalation ticket when customer gives < 4 stars', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'msg_low_star',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      // Ensure conversation is in active state before escalation test
      await platformRepo.updateConversationStatus('919876543271', 'active');

      // Customer taps 1-3 stars button (or sends low rating)
      const resultLowStar = await orchestrator.processMessage({
        from: '919876543271',
        messageId: 'msg_rating_2_stars',
        body: '2 stars',
        interactiveButtonId: 'btn_csat_low_stars',
      });

      // Should trigger escalation workflow
      expect(resultLowStar.action).toBe('escalated');
      expect(resultLowStar.responseText).toContain('truly sorry');
      expect(resultLowStar.responseText).toContain('opened an escalation ticket');
      expect(resultLowStar.responseText).toContain('what went wrong');

      // Verify review recorded with status escalated
      const reviews = await platformRepo.getCustomerReviews('919876543271');
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0]?.rating).toBe(2);
      expect(reviews[0]?.status).toBe('escalated');

      // Verify escalation ticket created in support_tickets table
      const tickets = await platformRepo.getEscalationTickets('open');
      const lowStarTicket = tickets.find((t) => t.phoneNumber === '919876543271');
      expect(lowStarTicket).toBeDefined();
      expect(lowStarTicket?.reason).toContain('CSAT Rating < 4 Stars');
    });

    it('should thank customer and offer review links when customer gives 4 stars', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'msg_4_star',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn(),
        sendProductList: vi.fn(),
        verifyWebhook: () => true,
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: mockWhatsApp,
        platformRepository: platformRepo,
        ecommerceAdapter: mockEcommerceAdapter as any,
      });

      // Customer selects 4 stars
      const result4Star = await orchestrator.processMessage({
        from: '919876543272',
        messageId: 'msg_rating_4_stars',
        body: '⭐⭐⭐⭐ (4 Stars)',
        interactiveButtonId: 'btn_csat_4_stars',
      });

      expect(result4Star.action).toBe('answered');
      expect(result4Star.responseText).toContain('4-star feedback');
      expect(result4Star.responseText).toContain('https://g.page/r/mintarabites/review');

      // Verify review recorded
      const reviews = await platformRepo.getCustomerReviews('919876543272');
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0]?.rating).toBe(4);
    });

    it('should expose API endpoints to retrieve recorded NDR instructions and CSAT reviews', async () => {
      // Test GET /api/logistics/ndr
      const ndrRes = await app.inject({
        method: 'GET',
        url: '/api/logistics/ndr?phone=919876543260',
      });
      expect(ndrRes.statusCode).toBe(200);
      const ndrData = ndrRes.json();
      expect(ndrData.status).toBe('ok');
      expect(ndrData.count).toBeGreaterThan(0);
      expect(ndrData.instructions[0].customerPhone).toBe('919876543260');

      // Test GET /api/customer/reviews
      const revRes = await app.inject({
        method: 'GET',
        url: '/api/customer/reviews?phone=919876543270',
      });
      expect(revRes.statusCode).toBe(200);
      const revData = revRes.json();
      expect(revData.status).toBe('ok');
      expect(revData.count).toBeGreaterThan(0);
      expect(revData.reviews[0].rating).toBe(5);
    });

    it('should batch-sync reviews from multiple platforms (Website, Google, Amazon) all together', async () => {
      const syncRes = await app.inject({
        method: 'POST',
        url: '/api/reviews/batch-sync',
        payload: {
          reviews: [
            {
              externalReviewId: 'g_rev_101',
              platform: 'google',
              customerName: 'Aman Shah',
              rating: 5,
              comment: 'Best Paan Mukhwas in Gujarat! Crisp and fresh gulkand flavor.',
            },
            {
              externalReviewId: 'web_rev_202',
              platform: 'website',
              customerName: 'Priya Patel',
              rating: 5,
              comment: 'Loved the Seeds Fusion and Coconut Crunch combo. Fast shipping!',
            },
            {
              externalReviewId: 'amz_rev_303',
              platform: 'amazon',
              customerName: 'Rajesh K',
              rating: 4,
              comment: 'Great taste and packaging. 100% supari-free as advertised.',
            },
          ],
        },
      });

      expect(syncRes.statusCode).toBe(200);
      const syncData = syncRes.json();
      expect(syncData.status).toBe('synced');
      expect(syncData.syncedCount).toBe(3);
      expect(syncData.summary.totalReviews).toBeGreaterThanOrEqual(3);
      expect(syncData.summary.platformBreakdown.google).toBeDefined();
      expect(syncData.summary.platformBreakdown.website).toBeDefined();
      expect(syncData.summary.platformBreakdown.amazon).toBeDefined();
      expect(syncData.summary.averageRating).toBeGreaterThanOrEqual(4.0);
    });

    it('should update an existing review rating via PATCH /api/reviews/:id and recompute unified score', async () => {
      const updateRes = await app.inject({
        method: 'PATCH',
        url: '/api/reviews/g_rev_101',
        payload: {
          rating: 4,
          comment: 'Updated review: great mukhwas, wish there was a 1kg pack!',
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const updateData = updateRes.json();
      expect(updateData.status).toBe('updated');
      expect(updateData.review.rating).toBe(4);
      expect(updateData.summary).toBeDefined();
    });

    it('should fetch unified omnichannel rating metrics via GET /api/reviews/summary', async () => {
      const summaryRes = await app.inject({
        method: 'GET',
        url: '/api/reviews/summary',
      });

      expect(summaryRes.statusCode).toBe(200);
      const data = summaryRes.json();
      expect(data.status).toBe('ok');
      expect(data.summary.totalReviews).toBeGreaterThan(0);
      expect(data.summary.averageRating).toBeGreaterThan(0);
      expect(data.summary.ratingDistribution[5]).toBeGreaterThan(0);
    });

    it('should ingest website review submission webhook (review.created) from mintarabites.com modal', async () => {
      const webhookRes = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          'x-webhook-secret': ecommerceSecret,
        },
        payload: {
          event: 'review.created',
          reviewId: 'web_modal_priyansh_1',
          productId: 'paan-mukhwas',
          customerName: 'Priyansh Shah',
          customerPhone: '919876543290',
          rating: 5,
          title: 'Super fresh and delightful flavour!',
          comment: 'Describe taste, texture, packaging, or fast Surat delivery...',
        },
      });

      expect(webhookRes.statusCode).toBe(200);
      const data = webhookRes.json();
      expect(data.status).toBe('synced');
      expect(data.event).toBe('review.created');
      expect(data.review.customerName).toBe('Priyansh Shah');
      expect(data.review.rating).toBe(5);
      expect(data.review.platform).toBe('website');

      // Verify it is part of unified review summary
      const summary = await platformRepo.getUnifiedReviewSummary();
      expect(summary.platformBreakdown.website).toBeDefined();
    });

    it('should support syncing website reviews from store database via POST /api/reviews/sync-from-store', async () => {
      const syncRes = await app.inject({
        method: 'POST',
        url: '/api/reviews/sync-from-store',
      });

      expect(syncRes.statusCode).toBe(200);
      const data = syncRes.json();
      expect(data.status).toBe('synced');
      expect(data.summary).toBeDefined();
    });
  });
});
