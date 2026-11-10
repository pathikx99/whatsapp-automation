import { describe, it, expect, beforeEach } from 'vitest';
import { synthesizeBusinessProfile } from '@whatsapp-platform/ai';
import { resetBusinessKnowledgeCache } from '@whatsapp-platform/config';
import { getPlatformRepository, resetPlatformRepository } from '@whatsapp-platform/database';
import { buildServer } from '../../apps/api/src/server.js';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { WhatsAppProvider, OutboundWhatsAppMessage } from '@whatsapp-platform/whatsapp';

describe('Universal AI Business Synthesizer, Direct Links & Customer Engagement', () => {
  let platformRepo: ReturnType<typeof getPlatformRepository>;

  beforeEach(() => {
    resetBusinessKnowledgeCache();
    resetPlatformRepository();
    platformRepo = getPlatformRepository();
  });

  // ---------------------------------------------------------------------------
  // 1. Direct Product Links Simplification
  // ---------------------------------------------------------------------------
  describe('1. Direct Product Links Simplification', () => {
    it('should provide direct product links and not require complex cart session states', async () => {
      let dispatchedMessage: OutboundWhatsAppMessage | undefined;
      const fakeWhatsAppProvider: WhatsAppProvider = {
        isConfigured: () => true,
        sendMessage: async (msg) => {
          dispatchedMessage = msg;
          return { messageId: 'msg_direct_link_test', status: 'sent' };
        },
      };

      const orchestrator = new SupportOrchestrator({
        whatsappProvider: fakeWhatsAppProvider,
        platformRepo,
      });

      const response = await orchestrator.processMessage({
        from: '919876543210',
        messageId: 'test_direct_link',
        interactiveButtonId: 'btn_size_paan_300g',
      });

      expect(response.action).toBe('answered');
      expect(response.checkoutUrl).toBeDefined();
      expect(response.checkoutUrl).toContain('https://mintarabites.com/products/artisanal-paan-mukhwas');
      expect(response.checkoutUrl).toContain('paan-mukhwas-300g');

      // Verify dispatched message provides direct product link
      expect(dispatchedMessage).toBeDefined();
      if (dispatchedMessage?.type === 'interactive') {
        expect(dispatchedMessage.body).toContain('direct product link');
        expect(dispatchedMessage.body).toContain('Tap here to view & order directly:');
        expect(dispatchedMessage.body).toContain(response.checkoutUrl);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Universal Business Synthesizer (FMCG, Service, B2B)
  // ---------------------------------------------------------------------------
  describe('2. Universal Business Knowledge Synthesizer', () => {
    it('should automatically synthesize an FMCG / Retail brand from raw text', async () => {
      const rawKnowledge = `
        # Gourmet Spices & Chai Treats
        We craft pure, organic spiced chai premixes and herbal infusion treats in Jaipur, Rajasthan.
        All our items are 100% natural, preservative-free, and vegan.
        
        Our Offerings:
        - *Royal Masala Chai Premix* (₹299): Handcrafted CTC tea blended with cardamom, cinnamon, and cloves.
        - *Kashmiri Saffron Kahwa* (₹499): Green tea infused with pure Kashmiri saffron, almonds, and rose petals.
        
        Policies:
        Express courier across India with free shipping on orders above ₹499.
        
        Questions:
        Q: Are your ingredients organic?
        A: Yes, all spices are directly sourced from certified organic farms in Kerala.
      `;

      const profile = await synthesizeBusinessProfile(rawKnowledge, {
        brandName: 'Gourmet Spices & Chai',
        location: 'Jaipur, Rajasthan',
        websiteUrl: 'https://gourmetspices.in',
      });

      expect(profile.businessType).toBe('ecommerce');
      expect(profile.brand.name).toBe('Gourmet Spices & Chai');
      expect(profile.terminology.itemNoun.length).toBeGreaterThan(0);
      expect(profile.offerings.length).toBeGreaterThanOrEqual(2);

      const kahwa = profile.offerings.find((o) => o.title.includes('Kahwa'));
      expect(kahwa).toBeDefined();
      expect(kahwa?.url).toContain('https://gourmetspices.in/products/');

      // Verify engagement defaults
      expect(profile.engagement.maxDailyMessagesPerCustomer).toBeGreaterThanOrEqual(10);
      expect(profile.engagement.marketingCooldownDays).toBe(14);
    });

    it('should automatically synthesize a Service-based practice (Clinic / Appointments)', async () => {
      const rawServiceKnowledge = `
        Aura Aesthetic Dermatology & Dental Clinic
        Premier skin and smile wellness practice in Indiranagar, Bengaluru.
        
        Treatments & Consultations:
        - *HydraFacial Glow Therapy* (₹2500): Deep pore cleansing and antioxidant infusion. Duration: 60 mins.
        - *Invisalign Smile Consultation* (₹500): 3D iTero digital dental scan and alignment roadmap.
        
        Booking Policy:
        Appointments can be booked online. Please arrive 10 minutes prior to scheduled slot.
        
        FAQs:
        Q: Do I need a prior appointment?
        A: Yes, all consultations require advance appointment booking.
      `;

      const profile = await synthesizeBusinessProfile(rawServiceKnowledge, {
        websiteUrl: 'https://auraclinic.in',
      });

      expect(profile.businessType).toBe('service');
      expect(['service', 'treatment', 'consultation']).toContain(profile.terminology.itemNoun.toLowerCase());
      expect(profile.terminology.actionVerb.toLowerCase()).toBe('book');
      expect(profile.terminology.browseButtonTitle.length).toBeGreaterThan(0);
      expect(profile.offerings.length).toBeGreaterThanOrEqual(2);

      const hydra = profile.offerings.find((o) => o.title.toLowerCase().includes('hydrafacial'));
      expect(hydra).toBeDefined();
      expect(hydra?.type).toBe('service');
    });

    it('should automatically synthesize a B2B Wholesale / Manufacturing business', async () => {
      const rawB2BKnowledge = `
        Apex Precision Fasteners & Industrial Hardware
        Leading ISO 9001 certified manufacturer of aerospace titanium fasteners, hex bolts, and industrial rivets based in Pune.
        Wholesale supply and custom fabrication for tier-1 OEMs. MOQ applies.
        
        Catalog & Bulk Lines:
        - *Grade 5 Titanium Hex Bolts* (₹120): High-tensile aerospace specification fasteners. Minimum order 500 units.
        - *Corrosion Resistant Stainless Rivets* (₹45): Industrial grade marine fasteners. Minimum order 1000 units.
        
        Policies:
        RFP and quotes processed within 24 hours. Custom drawing CAD validation available.
      `;

      const profile = await synthesizeBusinessProfile(rawB2BKnowledge, {
        websiteUrl: 'https://apexfasteners.com',
      });

      expect(profile.businessType).toBe('b2b');
      expect(['inquire', 'order', 'quote']).toContain(profile.terminology.actionVerb.toLowerCase());
      expect(profile.offerings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Supabase Storage & ChatGPT Action Endpoints
  // ---------------------------------------------------------------------------
  describe('3. Supabase Storage & ChatGPT Action Endpoints', () => {
    it('should ingest raw business text via POST /api/business/ingest and hot-reload', async () => {
      const server = await buildServer({ disableRequestLogging: true });

      const ingestPayload = {
        rawText: `
          # Zen Botanicals
          Artisanal plant-based skincare crafted in Pune.
          - *Radiance Rose Mist* (₹399): Pure steam-distilled rosewater.
          - *Kumkumadi Facial Oil* (₹899): Ayurvedic saffron elixir.
        `,
        brandName: 'Zen Botanicals',
        websiteUrl: 'https://zenbotanicals.in',
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/business/ingest',
        payload: ingestPayload,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.version).toBeGreaterThanOrEqual(1);
      expect(data.profile.brand.name).toBe('Zen Botanicals');
      expect(data.profile.offerings.length).toBeGreaterThanOrEqual(2);

      await server.close();
    });

    it('should update business settings via PUT /api/business/profile (ChatGPT Custom Action)', async () => {
      const server = await buildServer({ disableRequestLogging: true });

      // Fetch active profile
      const getRes = await server.inject({
        method: 'GET',
        url: '/api/business/profile',
      });
      expect(getRes.statusCode).toBe(200);
      const activeData = JSON.parse(getRes.body);

      // ChatGPT modifies active promo code and daily message limits
      const updatedProfile = {
        ...activeData.profile,
        promotions: {
          enabled: true,
          activePromo: {
            code: 'CHATGPT20',
            description: '20% off exclusively configured via ChatGPT Custom Action',
            discountPercentage: 20,
            minOrderAmount: 499,
          },
        },
        engagement: {
          ...activeData.profile.engagement,
          maxDailyMessagesPerCustomer: 30,
        },
      };

      const putRes = await server.inject({
        method: 'PUT',
        url: '/api/business/profile',
        payload: {
          profile: updatedProfile,
          updatedBy: 'chatgpt_custom_action',
        },
      });

      expect(putRes.statusCode).toBe(200);
      const putData = JSON.parse(putRes.body);
      expect(putData.success).toBe(true);
      expect(putData.profile.promotions.enabled).toBe(true);
      expect(putData.profile.promotions.activePromo.code).toBe('CHATGPT20');
      expect(putData.profile.engagement.maxDailyMessagesPerCustomer).toBe(30);

      await server.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Customer Engagement Analytics & Guardrails
  // ---------------------------------------------------------------------------
  describe('4. Customer Engagement Analytics & Guardrails', () => {
    it('should calculate customer message stats accurately', async () => {
      const testPhone = '9199' + Math.floor(10000000 + Math.random() * 90000000);
      const conv = await platformRepo.getOrCreateConversation(testPhone, 'Rahul Sharma');
      await platformRepo.appendMessage(conv.id, testPhone, 'customer', 'Hi there!');
      await platformRepo.appendMessage(conv.id, testPhone, 'assistant', 'Hello Rahul! How can I help?');
      await platformRepo.appendMessage(conv.id, testPhone, 'customer', 'Do you deliver to Delhi?');

      const stats = await platformRepo.getCustomerMessageStats(testPhone);
      expect(stats.phoneNumber).toBe(testPhone);
      expect(stats.totalInbound).toBe(2);
      expect(stats.totalOutbound).toBe(1);
      expect(stats.totalMessages).toBe(3);
      expect(stats.messagesToday).toBe(3);
      expect(stats.lastMessageAt).toBeDefined();

      const limitCheck = await platformRepo.checkCustomerDailyLimit(testPhone, 25);
      expect(limitCheck.allowed).toBe(true);
      expect(limitCheck.countToday).toBe(3);
    });

    it('should serve owner customer metrics and dashboard summary via REST API', async () => {
      const server = await buildServer({ disableRequestLogging: true });

      const metricsRes = await server.inject({
        method: 'GET',
        url: '/api/owner/metrics/customers?limit=10',
      });
      expect(metricsRes.statusCode).toBe(200);
      const metricsData = JSON.parse(metricsRes.body);
      expect(Array.isArray(metricsData.customers)).toBe(true);

      const cartsRes = await server.inject({
        method: 'GET',
        url: '/api/owner/metrics/carts',
      });
      expect(cartsRes.statusCode).toBe(200);
      const cartsData = JSON.parse(cartsRes.body);
      expect(Array.isArray(cartsData.carts)).toBe(true);

      const summaryRes = await server.inject({
        method: 'GET',
        url: '/api/owner/metrics/summary',
      });
      expect(summaryRes.statusCode).toBe(200);
      const summaryData = JSON.parse(summaryRes.body);
      expect(summaryData.summary).toBeDefined();
      expect(typeof summaryData.summary.totalConversations).toBe('number');
      expect(typeof summaryData.summary.totalMessagesToday).toBe('number');

      await server.close();
    });
  });
});
