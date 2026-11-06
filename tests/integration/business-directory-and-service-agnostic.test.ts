import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  resetBusinessKnowledgeCache,
  loadBusinessKnowledge,
  buildBusinessSystemPrompt,
  formatTemplate,
  findRootDir,
  businessProfileSchema,
} from '@whatsapp-platform/config';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { getPlatformRepository } from '@whatsapp-platform/database';
import { WhatsAppProvider, OutboundWhatsAppMessage } from '@whatsapp-platform/whatsapp';

describe('Business Directory Hub & Service-Agnostic Architecture', () => {
  const rootDir = findRootDir();
  const platformRepo = getPlatformRepository();

  it('should find the dedicated business/ directory and verify all mandatory files exist', () => {
    const businessDir = path.join(rootDir, 'business');
    expect(fs.existsSync(businessDir)).toBe(true);

    const profileJsonPath = path.join(businessDir, 'business-profile.json');
    const knowledgeMdPath = path.join(businessDir, 'business-knowledge.md');
    const schemaJsonPath = path.join(businessDir, 'business-profile.schema.json');
    const readmePath = path.join(businessDir, 'README.md');

    expect(fs.existsSync(profileJsonPath)).toBe(true);
    expect(fs.existsSync(knowledgeMdPath)).toBe(true);
    expect(fs.existsSync(schemaJsonPath)).toBe(true);
    expect(fs.existsSync(readmePath)).toBe(true);

    // Verify examples exist
    const serviceExamplePath = path.join(businessDir, 'examples', 'service-business-profile.json');
    const serviceKnowledgePath = path.join(businessDir, 'examples', 'service-business-knowledge.md');
    const ecommerceExamplePath = path.join(businessDir, 'examples', 'ecommerce-business-profile.json');

    expect(fs.existsSync(serviceExamplePath)).toBe(true);
    expect(fs.existsSync(serviceKnowledgePath)).toBe(true);
    expect(fs.existsSync(ecommerceExamplePath)).toBe(true);
  });

  it('should automatically load active configuration from business/ directory by default', () => {
    resetBusinessKnowledgeCache();
    delete process.env.BUSINESS_PROFILE_PATH;

    const { profile, customKnowledgeMarkdown } = loadBusinessKnowledge(true);
    expect(profile.brand.name).toBe('Mintara Bites');
    expect(profile.businessType).toBe('ecommerce');
    expect(profile.terminology.itemNoun).toBe('treat');
    expect(profile.offerings.length).toBeGreaterThan(0);
    expect(customKnowledgeMarkdown).toContain('Storage & Shelf Life Guidelines');
  });

  it('should seamlessly validate and load a Service-Based Business profile', () => {
    const serviceExamplePath = path.join(rootDir, 'business', 'examples', 'service-business-profile.json');
    const serviceRaw = fs.readFileSync(serviceExamplePath, 'utf8');
    const serviceJson = JSON.parse(serviceRaw);

    const parsed = businessProfileSchema.parse(serviceJson);
    expect(parsed.businessType).toBe('service');
    expect(parsed.brand.name).toBe('Lumina Dental & Aesthetic Clinic');
    expect(parsed.terminology.itemNoun).toBe('service');
    expect(parsed.terminology.actionVerb).toBe('Book');
    expect(parsed.terminology.browseButtonTitle).toBe('🗓️ View Services');
    expect(parsed.terminology.trackingButtonTitle).toBe('📅 My Appointments');

    // Verify offerings and duration
    expect(parsed.offerings.length).toBeGreaterThanOrEqual(3);
    const scaling = parsed.offerings.find((o) => o.id === 'dental-scaling');
    expect(scaling).toBeDefined();
    expect(scaling?.type).toBe('service');
    expect(scaling?.durationMinutes).toBe(45);
    expect(scaling?.bookingUrl).toContain('https://luminaclinic.com/book');
  });

  it('should dynamically generate AI system prompt tailored for a Service Practice', () => {
    const serviceExamplePath = path.join(rootDir, 'business', 'examples', 'service-business-profile.json');
    process.env.BUSINESS_PROFILE_PATH = path.relative(rootDir, serviceExamplePath);
    resetBusinessKnowledgeCache();

    const systemPrompt = buildBusinessSystemPrompt({
      customerContext: 'Patient Name: Priya Verma\nPrior Visit: 3 months ago (Scaling)',
    });

    expect(systemPrompt).toContain('Business Model: SERVICE');
    expect(systemPrompt).toContain('Lumina Dental & Aesthetic Clinic');
    expect(systemPrompt).toContain('Available Services & Treatments:');
    expect(systemPrompt).toContain('Ultrasonic Dental Scaling & Polish');
    expect(systemPrompt).toContain('Laser Teeth Whitening');
    expect(systemPrompt).toContain('Booking Link: https://luminaclinic.com/book');

    // Clean up
    delete process.env.BUSINESS_PROFILE_PATH;
    resetBusinessKnowledgeCache();
  });

  it('should handle service selection and dispatch booking links when running as a Service Business', async () => {
    const serviceExamplePath = path.join(rootDir, 'business', 'examples', 'service-business-profile.json');
    const serviceRaw = fs.readFileSync(serviceExamplePath, 'utf8');
    const serviceProfile = businessProfileSchema.parse(JSON.parse(serviceRaw));

    const sentMessages: OutboundWhatsAppMessage[] = [];
    const mockWhatsApp: WhatsAppProvider = {
      isConfigured: () => true,
      sendMessage: vi.fn().mockImplementation(async (msg: OutboundWhatsAppMessage) => {
        sentMessages.push(msg);
        return { messageId: 'msg_service_booking', status: 'sent', recipient: msg.to, timestamp: new Date().toISOString() };
      }),
      sendInteractiveButtons: vi.fn(),
      sendProduct: vi.fn(),
      sendProductList: vi.fn(),
      verifyWebhook: () => true,
    };

    const orchestrator = new SupportOrchestrator({
      whatsappProvider: mockWhatsApp,
      platformRepository: platformRepo,
      ecommerceAdapter: {
        isConfigured: () => true,
        getCustomerByPhone: vi.fn().mockResolvedValue(null),
        getCustomerOrders: vi.fn().mockResolvedValue([]),
        getAllActiveProducts: vi.fn().mockResolvedValue([]),
        searchProducts: vi.fn().mockResolvedValue([]),
        getMarketingCandidates: vi.fn().mockResolvedValue([]),
        predictReplenishment: vi.fn().mockResolvedValue(null),
        getWebsiteReviews: vi.fn().mockResolvedValue([]),
      } as any,
      businessProfile: serviceProfile,
    });

    // Patient selects 60 Mins Deep Clean service button
    const result = await orchestrator.processMessage({
      from: '919876543290',
      messageId: 'msg_patient_select_scaling',
      body: 'Deep Cleaning 60m',
      interactiveButtonId: 'btn_size_paan_300g', // mapped in service variants
    });

    expect(result.action).toBe('answered');
    expect(result.responseText).toContain('Selected *Ultrasonic Dental Scaling & Polish');
    expect(result.responseText).toContain('Tap here to schedule / book your appointment');
    expect(result.checkoutUrl).toContain('https://luminaclinic.com/book?service=scaling-60m');

    // Verify interactive buttons use service terminology
    expect(sentMessages.length).toBe(1);
    const sentButtons = (sentMessages[0] as any).buttons;
    expect(sentButtons).toBeDefined();
    expect(sentButtons[0].title).toBe('🗓️ View Services');
    expect(sentButtons[1].title).toBe('📅 My Appointments');
  });

  it('should correctly format appointment and service aftercare notification templates', () => {
    const serviceExamplePath = path.join(rootDir, 'business', 'examples', 'service-business-profile.json');
    const serviceRaw = fs.readFileSync(serviceExamplePath, 'utf8');
    const serviceProfile = businessProfileSchema.parse(JSON.parse(serviceRaw));

    // 1. Appointment Confirmation
    const bookingMsg = formatTemplate(serviceProfile.notifications.orderCreated.body, {
      customerName: 'Kavita',
      orderNumber: 'APT-904',
      brandName: serviceProfile.brand.name,
      itemsSummary: '1x Laser Teeth Whitening (45 Mins)',
      totalAmount: 3499,
      orderTrackingUrl: serviceProfile.brand.links?.orderTrackingUrl,
    });
    expect(bookingMsg).toContain('appointment booking *#APT-904*');
    expect(bookingMsg).toContain('Laser Teeth Whitening');
    expect(bookingMsg).toContain('https://luminaclinic.com/account/appointments');

    // 2. Post-Session Care
    const careMsg = serviceProfile.notifications.orderDelivered.refrigerationNudge;
    expect(careMsg).toContain('drink room temperature water');
    expect(careMsg).toContain('avoid staining food/drink');

    // 3. Reschedule / Missed Appointment Alert
    const missedMsg = formatTemplate(serviceProfile.notifications.ndrAlert.body, {
      customerName: 'Kavita',
      orderNumber: 'APT-904',
      reason: 'Patient called with urgent meeting conflict',
    });
    expect(missedMsg).toContain('couldn\'t make it to your scheduled session');
    expect(missedMsg).toContain('reschedule to another convenient date');
  });
});
