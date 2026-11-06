import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';
import { getPlatformRepository } from '@whatsapp-platform/database';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { processSingleJob } from '../../apps/worker/src/index.js';
import {
  WhatsAppProvider,
  OutboundWhatsAppMessage,
} from '@whatsapp-platform/whatsapp';
import {
  calculateConsumptionVelocity,
} from '@whatsapp-platform/ecommerce-adapter';

describe('WhatsApp Commerce, Replenishment, Abandoned Cart & CTWA Attribution', () => {
  let app: FastifyInstance;
  const platformRepo = getPlatformRepository();
  const testSecret = 'test_webhook_app_secret_123';
  const ecommerceSecret = 'test_ecommerce_secret_456';

  const mockEcommerceAdapter = {
    isConfigured: () => true,
    getCustomerByPhone: vi.fn().mockResolvedValue({
      id: 'cust_123',
      phoneNumber: '919876543210',
      firstName: 'Aarav',
    }),
    getCustomerOrders: vi.fn().mockResolvedValue([
      {
        id: 'ord_1',
        customerId: 'cust_123',
        orderNumber: 'MB-1001',
        status: 'DELIVERED',
        totalAmount: 249,
        currency: 'INR',
        createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
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
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'production';
    process.env.API_PORT = '3000';
    process.env.WHATSAPP_APP_SECRET = testSecret;
    process.env.ECOMMERCE_WEBHOOK_SECRET = ecommerceSecret;
    process.env.WHATSAPP_CATALOG_ID = 'meta_catalog_mintara_001';

    resetConfigCache();
    app = await buildServer({ disableRequestLogging: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // 1. Native WhatsApp Catalog & In-Chat Checkout
  // ===========================================================================
  describe('1. Native WhatsApp Catalog & In-Chat Checkout', () => {
    it('should generate interactive product and product_list payload types correctly', async () => {
      const sentMessages: OutboundWhatsAppMessage[] = [];
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
          sentMessages.push(msg);
          return {
            messageId: 'mock_msg_catalog',
            status: 'sent',
            recipient: msg.to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendInteractiveButtons: vi.fn(),
        sendProduct: vi.fn().mockImplementation(async (to, catalogId, productRetailerId, body, footer) => {
          const msg: OutboundWhatsAppMessage = {
            type: 'product',
            to,
            catalogId,
            productRetailerId,
            body,
            footer,
          };
          sentMessages.push(msg);
          return {
            messageId: 'mock_msg_single_product',
            status: 'sent',
            recipient: to,
            timestamp: new Date().toISOString(),
          };
        }),
        sendProductList: vi.fn().mockImplementation(async (to, catalogId, headerText, body, sections, footer) => {
          const msg: OutboundWhatsAppMessage = {
            type: 'product_list',
            to,
            catalogId,
            headerText,
            body,
            sections,
            footer,
          };
          sentMessages.push(msg);
          return {
            messageId: 'mock_msg_product_list',
            status: 'sent',
            recipient: to,
            timestamp: new Date().toISOString(),
          };
        }),
        verifyWebhook: () => true,
      };

      // Test sendProduct
      await mockWhatsApp.sendProduct(
        '919876543210',
        'meta_catalog_mintara_001',
        'paan-mukhwas-300g',
        'Artisanal Paan Mukhwas (300g) with pure rose petal gulkand',
        '100% Supari & Tobacco Free',
      );

      expect(sentMessages.length).toBe(1);
      const productMsg = sentMessages[0];
      expect(productMsg.type).toBe('product');
      if (productMsg.type === 'product') {
        expect(productMsg.catalogId).toBe('meta_catalog_mintara_001');
        expect(productMsg.productRetailerId).toBe('paan-mukhwas-300g');
        expect(productMsg.body).toContain('Artisanal Paan Mukhwas');
      }

      // Test sendProductList
      await mockWhatsApp.sendProductList(
        '919876543210',
        'meta_catalog_mintara_001',
        'Mintara Bites Artisanal Treats',
        'Explore signature varieties:',
        [
          {
            title: 'Paan Mukhwas',
            productRetailerIds: ['paan-mukhwas-150g', 'paan-mukhwas-300g', 'paan-mukhwas-500g'],
          },
          {
            title: 'Seeds & Crunch',
            productRetailerIds: ['seeds-fusion-regular-100g', 'coconut-crunch-100g'],
          },
        ],
        'Supari Free',
      );

      expect(sentMessages.length).toBe(2);
      const listMsg = sentMessages[1];
      expect(listMsg.type).toBe('product_list');
      if (listMsg.type === 'product_list') {
        expect(listMsg.catalogId).toBe('meta_catalog_mintara_001');
        expect(listMsg.sections.length).toBe(2);
        expect(listMsg.sections[0]?.productRetailerIds).toContain('paan-mukhwas-300g');
      }
    });

    it('should allow customer to pick pack sizes (150g, 300g, 500g) and receive prefilled checkout link', async () => {
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockResolvedValue({
          messageId: 'mock_size_select',
          status: 'sent',
          recipient: '919876543210',
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

      // Customer taps 300g button
      const result300g = await orchestrator.processMessage({
        from: '919876543210',
        messageId: 'test_pick_300g',
        body: 'Paan Mukhwas 300g',
        interactiveButtonId: 'btn_size_paan_300g',
      });

      expect(result300g.action).toBe('answered');
      expect(result300g.responseText).toContain('Paan Mukhwas (300g)');
      expect(result300g.responseText).toContain('₹249');
      expect(result300g.checkoutUrl).toBeDefined();
      expect(result300g.checkoutUrl).toContain('paan-mukhwas-300g');
      expect(result300g.checkoutUrl).toContain('https://mintarabites.com');

      // Customer chooses 500g via text
      const result500g = await orchestrator.processMessage({
        from: '919876543210',
        messageId: 'test_pick_500g',
        body: 'I want Paan Mukhwas 500g please',
      });

      expect(result500g.action).toBe('answered');
      expect(result500g.responseText).toContain('Paan Mukhwas (500g)');
      expect(result500g.responseText).toContain('₹399');
      expect(result500g.checkoutUrl).toContain('paan-mukhwas-500g');
    });

    it('should handle in-chat WhatsApp catalog order webhook and reply with direct prefilled checkout link', async () => {
      const orderPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '12345', phone_number_id: '67890' },
                  contacts: [{ profile: { name: 'Aarav' }, wa_id: '919876543210' }],
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid_order_test_1',
                      timestamp: '1730912345',
                      type: 'order',
                      order: {
                        catalog_id: 'meta_catalog_mintara_001',
                        text: 'Please deliver my fresh treats',
                        product_items: [
                          {
                            product_retailer_id: 'paan-mukhwas-300g',
                            quantity: 2,
                            item_price: 249,
                            currency: 'INR',
                          },
                          {
                            product_retailer_id: 'combo-trio-350g',
                            quantity: 1,
                            item_price: 399,
                            currency: 'INR',
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(orderPayload);
      const hash = crypto.createHmac('sha256', testSecret).update(raw).digest('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'x-hub-signature-256': `sha256=${hash}`,
          'content-type': 'application/json',
        },
        payload: orderPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('received');
    });
  });

  // ===========================================================================
  // 2. Smart Replenishment Prediction Engine
  // ===========================================================================
  describe('2. Smart Replenishment Prediction Engine', () => {
    it('should accurately calculate consumption velocity (300g Paan Mukhwas lasts ~3-4 weeks, day 25 reminder)', () => {
      const orders = [
        {
          id: 'ord_1',
          customerId: 'cust_1',
          orderNumber: 'MB-1001',
          status: 'DELIVERED',
          totalAmount: 249,
          currency: 'INR',
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), // 25 days ago
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
      ];

      const prediction = calculateConsumptionVelocity(orders, {
        dailyRateGrams: 12,
        websiteUrl: 'https://mintarabites.com',
      });

      expect(prediction.totalGrams).toBe(300);
      expect(prediction.estimatedRunoutDays).toBe(25); // 300 / 12 = 25 days
      expect(prediction.targetReminderDay).toBe(25);
      expect(prediction.isDueForReplenishment).toBe(true);
      expect(prediction.daysSinceLastOrder).toBe(25);
      expect(prediction.favoriteProduct).toContain('Artisanal Paan Mukhwas');
      expect(prediction.reorderCheckoutUrl).toContain('https://mintarabites.com');
      expect(prediction.reorderCheckoutUrl).toContain('paan-mukhwas');
    });

    it('should handle 1-click reorder button (Reorder My Favorites) in chat', async () => {
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockResolvedValue({
          messageId: 'mock_reorder_send',
          status: 'sent',
          recipient: '919876543210',
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
        from: '919876543210',
        messageId: 'test_reorder_click',
        body: 'Reorder My Favorites',
        interactiveButtonId: 'btn_reorder_favorites',
      });

      expect(result.action).toBe('answered');
      expect(result.responseText).toContain('1-Click Reorder');
      expect(result.responseText).toContain('Artisanal Paan Mukhwas');
      expect(result.checkoutUrl).toBeDefined();
      expect(result.checkoutUrl).toContain('https://mintarabites.com');
    });

    it('should automatically schedule a day-25 replenishment reminder when order is created/paid', async () => {
      const orderWebhookPayload = {
        event: 'order.paid',
        customerPhone: '919876543299',
        customerName: 'Kunal',
        orderNumber: 'MB-9999',
        items: [{ name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 }],
        totalAmount: 249,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: `Bearer ${ecommerceSecret}`,
        },
        payload: orderWebhookPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('dispatched');

      // Verify replenishment reminder job was enqueued for day 25
      const scheduledJobs = await platformRepo.fetchScheduledJobs('replenishment_reminder', 20);
      const reminderJob = scheduledJobs.find(
        (j) => (j.payload as any).customerPhone === '919876543299',
      );
      expect(reminderJob).toBeDefined();

      // Note: The job is scheduled for 25 days in the future so fetchPendingJobs (lte now) won't return it
      // but let's test processSingleJob directly with a replenishment job!
      const testJob = await platformRepo.enqueueJob(
        'replenishment_reminder',
        {
          customerPhone: '919876543299',
          customerName: 'Kunal',
          orderNumber: 'MB-9999',
          items: [{ name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 }],
        },
        new Date().toISOString(), // scheduled now for execution test
      );

      expect(testJob.status).toBe('pending');
      await processSingleJob(testJob);
      expect(testJob.status).toBe('completed');
    });
  });

  // ===========================================================================
  // 3. Dynamic Abandoned Cart Recovery with Incentives
  // ===========================================================================
  describe('3. Dynamic Abandoned Cart Recovery with Incentives', () => {
    it('should issue single-use personalized promo code (TREAT10-<suffix>) for carts abandoned > 4 hours', async () => {
      const customerPhone = '919876543210';
      const phoneSuffix = '3210';
      const expectedCode = `TREAT10-${phoneSuffix}`;

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: `Bearer ${ecommerceSecret}`,
        },
        payload: {
          event: 'cart.abandoned',
          customerPhone,
          customerName: 'Aarav',
          cartItemName: 'Artisanal Paan Mukhwas (300g)',
          abandonedDurationHours: 5, // > 4 hours!
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('dispatched');
      expect(body.event).toBe('cart.abandoned');
      expect(body.promoCode).toBe(expectedCode);

      // Verify promo code was stored in database with 24-hour expiration
      const savedCode = await platformRepo.getPromoCode(expectedCode);
      expect(savedCode).toBeDefined();
      expect(savedCode?.code).toBe(expectedCode);
      expect(savedCode?.type).toBe('percent');
      expect(savedCode?.value).toBe(10);
      expect(savedCode?.usageLimit).toBe(1);
      expect(savedCode?.expiresAt).toBeDefined();

      const expirationTime = new Date(savedCode!.expiresAt!).getTime();
      const now = Date.now();
      const hoursUntilExpiration = (expirationTime - now) / (1000 * 60 * 60);
      expect(hoursUntilExpiration).toBeGreaterThan(23);
      expect(hoursUntilExpiration).toBeLessThanOrEqual(24.1);
    });

    it('should not issue promo code if cart has been abandoned for <= 4 hours', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/ecommerce',
        headers: {
          authorization: `Bearer ${ecommerceSecret}`,
        },
        payload: {
          event: 'cart.abandoned',
          customerPhone: '919876543211',
          customerName: 'Sneha',
          cartItemName: 'Coconut Crunch (200g)',
          abandonedDurationHours: 2, // Only 2 hours, <= 4
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('dispatched');
      expect(body.promoCode).toBeUndefined();
    });
  });

  // ===========================================================================
  // 4. Click-to-WhatsApp Ads (CTWA) & Attribution Tracking
  // ===========================================================================
  describe('4. Click-to-WhatsApp Ads (CTWA) & Attribution Tracking', () => {
    it('should capture and store CTWA referral object in integration schema from inbound webhook', async () => {
      const adId = 'ad_meta_campaign_101';
      const headline = 'Artisanal 100% Supari-Free Paan Mukhwas';

      const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '12345', phone_number_id: '67890' },
                  contacts: [{ profile: { name: 'Vikram' }, wa_id: '919876543222' }],
                  messages: [
                    {
                      from: '919876543222',
                      id: 'wamid_ctwa_lead_1',
                      timestamp: '1730912400',
                      type: 'text',
                      text: { body: 'Hi, I saw your Instagram ad!' },
                      referral: {
                        source_id: adId,
                        ad_id: adId,
                        headline,
                        body: 'Freshly packed on order in Surat',
                        source_type: 'ad',
                        source_url: 'https://fb.me/mintara_ad_1',
                        media_type: 'image',
                        image_url: 'https://mintarabites.com/ad.jpg',
                        ctwa_clid: 'AR_CLICK_ID_123',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(webhookPayload);
      const hash = crypto.createHmac('sha256', testSecret).update(raw).digest('hex');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'x-hub-signature-256': `sha256=${hash}`,
          'content-type': 'application/json',
        },
        payload: webhookPayload,
      });

      expect(response.statusCode).toBe(200);

      // Verify referral stored in platform repository
      const referrals = await platformRepo.getAdReferrals('919876543222');
      expect(referrals.length).toBeGreaterThan(0);
      const recorded = referrals[0];
      expect(recorded?.adId).toBe(adId);
      expect(recorded?.headline).toBe(headline);
      expect(recorded?.sourceType).toBe('ad');
    });

    it('should trigger ad-specific welcome flows matching the ad headline', async () => {
      const mockWhatsApp: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockResolvedValue({
          messageId: 'mock_ad_welcome',
          status: 'sent',
          recipient: '919876543222',
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
        from: '919876543222',
        messageId: 'msg_ad_flow_test',
        body: 'Hi, I am interested',
        senderName: 'Vikram',
        referral: {
          adId: 'ad_meta_campaign_101',
          headline: 'Artisanal 100% Supari-Free Paan Mukhwas',
          sourceType: 'ad',
        },
      });

      expect(result.action).toBe('answered');
      expect(result.responseText).toContain('Artisanal 100% Supari-Free Paan Mukhwas');
      expect(result.responseText).toContain('100% supari-free');
      expect(result.responseText).toContain('Surat, Gujarat');
    });

    it('should calculate Return on Ad Spend (ROAS) and provide analytics endpoint', async () => {
      // Direct repo ROAS calculation
      const roasReport = await platformRepo.calculateROAS('ad_meta_campaign_101', 500);
      expect(roasReport).toBeDefined();
      expect(roasReport.adId).toBe('ad_meta_campaign_101');
      expect(roasReport.adSpend).toBe(500);
      expect(typeof roasReport.leadsCount).toBe('number');
      expect(typeof roasReport.totalRevenue).toBe('number');
      expect(typeof roasReport.roas).toBe('number');

      // Test API Endpoint GET /api/analytics/roas
      const apiResponse = await app.inject({
        method: 'GET',
        url: '/api/analytics/roas?adId=ad_meta_campaign_101&spend=500',
      });

      expect(apiResponse.statusCode).toBe(200);
      const body = JSON.parse(apiResponse.body);
      expect(body.status).toBe('ok');
      expect(body.report.adId).toBe('ad_meta_campaign_101');
      expect(body.report.adSpend).toBe(500);
    });
  });
});
