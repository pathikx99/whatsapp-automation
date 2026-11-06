import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';
import { getPlatformRepository } from '@whatsapp-platform/database';
import { createWhatsAppProvider } from '@whatsapp-platform/whatsapp';
import { createAiProvider } from '@whatsapp-platform/ai';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { generatePrefilledCheckoutUrl } from '@whatsapp-platform/ecommerce-adapter';

describe('New Features & Improvements (Typing, Multimodal, Lists, Idempotency, Live-Reply, Clean Links)', () => {
  let app: FastifyInstance;
  const platformRepo = getPlatformRepository();
  const whatsappProvider = createWhatsAppProvider();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'production';
    process.env.API_PORT = '3000';
    process.env.SUPABASE_URL = 'https://platform-test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-platform-secret-key-123';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-platform-pub-key-123';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce-test.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-anon-key-456';
    process.env.WHATSAPP_APP_SECRET = '';

    resetConfigCache();
    app = await buildServer({ disableRequestLogging: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Fixed Checkout & Cart Links (Photo Issue Resolution)', () => {
    it('should generate valid /cart URLs without broken path parameters', () => {
      const url = generatePrefilledCheckoutUrl([
        {
          name: 'Artisanal Paan Mukhwas (300g)',
          quantity: 1,
          sku: 'paan-mukhwas-300g',
          unitPrice: 249,
        },
      ]);

      expect(url).toBeDefined();
      expect(url).toContain('https://mintarabites.com/cart?');
      // Must NOT contain 404 path /cart/paan-mukhwas-300g:1
      expect(url).not.toContain('/cart/paan-mukhwas');
      expect(url).toContain('add=paan-mukhwas-300g%3A1');
      expect(url).toContain('source=whatsapp_commerce');
    });

    it('should cleanly support single-use promo code discounts in query', () => {
      const urlWithDiscount = generatePrefilledCheckoutUrl(
        [
          {
            name: 'Artisanal Paan Mukhwas (300g)',
            quantity: 1,
            sku: 'paan-mukhwas-300g',
            unitPrice: 249,
          },
        ],
        'TREAT10-9999',
      );

      expect(urlWithDiscount).toContain('discount=TREAT10-9999');
      expect(urlWithDiscount).toContain('add=paan-mukhwas-300g%3A1');
    });
  });

  describe('2. WhatsApp Typing Indicator & Immediate Read Receipts', () => {
    it('should support markMessageAsRead and sendTypingIndicator', async () => {
      const readResult = await whatsappProvider.markMessageAsRead('wamid_test_123');
      expect(readResult).toBe(true);

      const typingResult = await whatsappProvider.sendTypingIndicator('919876543210');
      expect(typingResult).toBe(true);
    });
  });

  describe('3. WhatsApp Interactive List Messages (type: list)', () => {
    it('should format and dispatch interactive list message structure with sections', async () => {
      const listResult = await whatsappProvider.sendInteractiveList(
        '919876543210',
        'Explore our treats:',
        'Browse Menu',
        [
          {
            title: 'Paan Mukhwas',
            rows: [
              { id: 'btn_size_paan_150g', title: '150g Pack', description: 'Pocket Pack • ₹149' },
              { id: 'btn_size_paan_300g', title: '300g Pack', description: 'Best Seller • ₹249' },
              { id: 'btn_size_paan_500g', title: '500g Pack', description: 'Family Pack • ₹399' },
            ],
          },
          {
            title: 'Seeds & Crunch',
            rows: [
              { id: 'btn_size_seeds_100g', title: 'Seeds 100g', description: 'Digestive Seeds • ₹149' },
            ],
          },
        ],
        { header: 'Mintara Bites Menu', footer: '100% Supari-Free' },
      );

      expect(listResult).toBeDefined();
      expect(listResult.recipient).toBe('919876543210');
      expect(['sent', 'simulated']).toContain(listResult.status);
    });
  });

  describe('4. Inbound Webhook Idempotency Guard', () => {
    it('should detect duplicate message IDs and prevent duplicate processing', async () => {
      const uniqueMsgId = `wamid_unique_test_${Date.now()}`;

      // First check: should be unrecorded
      const isFirst = await platformRepo.isWebhookProcessed(uniqueMsgId, 'whatsapp');
      expect(isFirst).toBe(false);

      // Record it
      await platformRepo.recordProcessedWebhook(uniqueMsgId, 'whatsapp', 'text');

      // Second check: should now be recorded (idempotent duplicate)
      const isSecond = await platformRepo.isWebhookProcessed(uniqueMsgId, 'whatsapp');
      expect(isSecond).toBe(true);
    });

    it('should handle webhook endpoint gracefully on duplicate messages', async () => {
      const duplicateMsgId = `wamid_dup_${Date.now()}`;
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '919876543210',
                      id: duplicateMsgId,
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      type: 'text',
                      text: { body: 'Hello there' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Send first time
      const res1 = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload,
      });
      expect(res1.statusCode).toBe(200);

      // Send second time (Meta retry simulation)
      const res2 = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload,
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).status).toBe('received');
    });
  });

  describe('5. Human Agent Live-Reply API (/api/support/conversations/:id/reply)', () => {
    it('should reject invalid request body without message text', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/support/conversations/non_existent_id/reply',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for unknown conversation ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/support/conversations/00000000-0000-0000-0000-000000000000/reply',
        payload: { message: 'Hello from agent' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should allow human agent to send live reply to customer and log message', async () => {
      // Create conversation
      const testPhone = '919876543299';
      const conv = await platformRepo.getOrCreateConversation(testPhone, 'Live Agent Test User');

      const response = await app.inject({
        method: 'POST',
        url: `/api/support/conversations/${conv.id}/reply`,
        payload: {
          message: "Hi! This is the store founder. I've personally dispatched a fresh jar for you!",
          agentName: 'Founder Support',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe('sent');
      expect(data.recipient).toBe(testPhone);
      expect(data.message.role).toBe('human_agent');
      expect(data.message.content).toContain('store founder');
    });
  });

  describe('6. Voice Notes (Audio) & Media Multimodal Handling', () => {
    it('should accept audio/voice note payload and location in support orchestrator without ignoring', async () => {
      const mockEcommerce = {
        isConfigured: () => true,
        getCustomerByPhone: async () => null,
        getCustomerOrders: async () => [],
        getAllActiveProducts: async () => [],
        getWebsiteReviews: async () => [],
        getMarketingCandidates: async () => [],
      };
      const mockAi = {
        isConfigured: () => true,
        generateResponse: async () => ({
          content: 'Thank you for your voice note! We have fresh Paan Mukhwas available.',
          model: 'mock-gemini',
        }),
      };
      const orchestrator = new SupportOrchestrator({
        ecommerceAdapter: mockEcommerce as any,
        aiProvider: mockAi as any,
      });

      // Audio voice note
      const voiceResult = await orchestrator.processMessage({
        from: '919876543210',
        messageId: `wamid_audio_${Date.now()}`,
        body: '',
        media: {
          id: 'media_audio_test_123',
          type: 'audio',
          mimeType: 'audio/wav',
        },
      });

      expect(voiceResult).toBeDefined();
      expect(voiceResult.action).toBe('answered');
      expect(voiceResult.responseText).toContain('voice note');

      // Location pin
      const locResult = await orchestrator.processMessage({
        from: '919876543210',
        messageId: `wamid_loc_${Date.now()}`,
        body: '',
        location: {
          latitude: 21.1702,
          longitude: 72.8311,
          name: 'Surat Home Landmark',
        },
      });

      expect(locResult).toBeDefined();
      expect(locResult.action).toBe('answered');
      expect(locResult.responseText).toContain('google.com/maps');
    });
  });

  describe('7. AI Provider Timeout and Media Parts', () => {
    it('should support media inlineData in completion requests', async () => {
      const ai = createAiProvider();
      // Valid minimal 1x1 PNG image base64
      const validPngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

      const res = await ai.generateResponse({
        messages: [
          {
            role: 'user',
            content: 'Describe what you see in one short phrase.',
            media: [
              {
                mimeType: 'image/png',
                data: validPngBase64,
              },
            ],
          },
        ],
        timeoutMs: 15000,
      });

      expect(res).toBeDefined();
      expect(res.content).toBeDefined();
    }, 20000);
  });
});
