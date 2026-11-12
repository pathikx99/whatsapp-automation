import { describe, it, expect, vi } from 'vitest';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { createEcommerceAdapter } from '../../packages/ecommerce-adapter/src/index.js';
import { WhatsAppProvider } from '../../packages/whatsapp/src/index.js';
import { AiProvider } from '../../packages/ai/src/index.js';
import {
  getBusinessProfile,
  formatTemplate,
  resetBusinessKnowledgeCache,
  resetConfigCache,
} from '../../packages/config/src/index.js';
import { getPlatformRepository } from '../../packages/database/src/index.js';

describe('AI Support and Delivery Status Guardrails', () => {
  const mockWhatsAppProvider: WhatsAppProvider = {
    isConfigured: () => true,
    sendMessage: vi.fn().mockResolvedValue({
      messageId: 'mock_test_id',
      status: 'simulated',
      recipient: '917490095115',
      timestamp: new Date().toISOString(),
    }),
    sendInteractiveButtons: vi.fn().mockResolvedValue({
      messageId: 'mock_test_id',
      status: 'simulated',
      recipient: '917490095115',
      timestamp: new Date().toISOString(),
    }),
    verifyWebhook: () => true,
  };

  const orchestrator = new SupportOrchestrator({
    whatsappProvider: mockWhatsAppProvider,
  });
  const adapter = createEcommerceAdapter();
  const platformRepo = getPlatformRepository();

  beforeAll(async () => {
    await platformRepo.updateConversationStatus('917490095115', 'active');
  });

  it('should successfully read active products without modifying the database', async () => {
    const products = await adapter.getAllActiveProducts();
    expect(products.length).toBeGreaterThan(0);
    const paan = products.find((p) => p.title.includes('Paan'));
    expect(paan).toBeDefined();
    expect(paan?.variants.length).toBeGreaterThan(0);
  });

  it('should strictly intercept delivery status inquiries and redirect to web without disclosing tracking on WhatsApp', async () => {
    const result = await orchestrator.processMessage({
      from: '917490095115',
      messageId: 'test_msg_delivery',
      body: 'Where is my order? Please track my courier delivery status',
    });

    expect(result.action).toBe('delivery_redirect');
    expect(result.responseText).toContain('https://mintarabites.com/account/orders');
    expect(result.responseText).not.toContain('courier tracking number:');
  });

  it('should trigger human agent escalation when requested', async () => {
    const result = await orchestrator.processMessage({
      from: '917490095115',
      messageId: 'test_msg_escalate',
      body: 'I want to speak with a human agent right now',
    });

    expect(result.action).toBe('escalated');
    expect(result.responseText).toContain('human support team');
  });

  it('should mute AI bot for escalated customer on subsequent inquiries', async () => {
    const result = await orchestrator.processMessage({
      from: '917490095115',
      messageId: 'test_msg_after_escalate',
      body: 'When will someone reply to me?',
    });

    expect(result.action).toBe('escalated_muted');
  });

  it('should allow customer to resume automated bot with start keyword', async () => {
    const result = await orchestrator.processMessage({
      from: '917490095115',
      messageId: 'test_msg_resume',
      body: 'start',
    });

    expect(result.action).toBe('answered');
    expect(result.responseText).toContain('automated assistant is back online');
  });

  it('should generate accurate AI answer for product inquiries using Gemini', async () => {
    const result = await orchestrator.processMessage({
      from: '919876543210',
      messageId: 'test_msg_faq',
      body: 'Is your Paan Mukhwas completely supari free and does it need refrigeration?',
    });

    expect(result.action).toBe('answered');
    expect(result.responseText).toBeDefined();
    expect(result.responseText?.length).toBeGreaterThan(10);
  }, 30000);

  it('should verify Talk to Agent button is completely eliminated from business-profile.json', () => {
    resetBusinessKnowledgeCache();
    const profile = getBusinessProfile();
    expect(profile.quickButtons.some((b) => b.id === 'btn_talk_human')).toBe(false);
    expect(profile.quickButtons.length).toBeGreaterThanOrEqual(2);
    expect(profile.quickButtons.map((b) => b.id)).toEqual([
      'btn_browse_catalog',
      'btn_track_order',
    ]);
  });

  it('should verify formatTemplate safely replaces direct and nested variables', () => {
    const template =
      'Hi {{customerName}}! Order #{{orderNumber}} from {{brand.name}}. Total: ₹{{total}}';
    const output = formatTemplate(template, {
      customerName: 'Aarav',
      orderNumber: 'MB-5001',
      brand: { name: 'Mintara Bites' },
      total: 699,
    });
    expect(output).toBe('Hi Aarav! Order #MB-5001 from Mintara Bites. Total: ₹699');

    // Missing variables become empty string
    const emptyOutput = formatTemplate('Item: {{missingItem}}', {});
    expect(emptyOutput).toBe('Item: ');
  });

  it('should autonomously escalate when AI detects unresolvable customer issue', async () => {
    process.env.ADMIN_ALERT_PHONE_NUMBER = '919999988888';
    resetConfigCache();

    const mockAi: AiProvider = {
      isConfigured: () => true,
      generateResponse: vi.fn().mockResolvedValue({
        content:
          '[ESCALATE: Customer received torn Coconut Crunch packet with spilled contents, requires refund/replacement] Hello Priya! 🙏 I have flagged this for our human support team and transferred your order details and full conversation history.',
        usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      }),
    };

    const autonomousOrchestrator = new SupportOrchestrator({
      whatsappProvider: mockWhatsAppProvider,
      aiProvider: mockAi,
      platformRepository: platformRepo,
    });

    // Make sure customer is active first
    await platformRepo.updateConversationStatus('919876543299', 'active');

    const result = await autonomousOrchestrator.processMessage({
      from: '919876543299',
      messageId: 'test_auto_escalate_1',
      body: 'My packet arrived torn and damaged!',
      senderName: 'Priya',
    });

    // 1. Result action is escalated
    expect(result.action).toBe('escalated');

    // 2. Response text does NOT contain [ESCALATE: ...] tag
    expect(result.responseText).not.toContain('[ESCALATE:');
    expect(result.responseText).toContain('human support team');

    // 3. Conversation is now marked escalated in database
    const conv = await platformRepo.getOrCreateConversation('919876543299');
    expect(conv.status).toBe('escalated');

    // 4. Ticket was created in platform database with diagnostic reason
    const tickets = await platformRepo.getEscalationTickets('open');
    const matchingTicket = tickets.find((t) => t.phoneNumber === '919876543299');
    expect(matchingTicket).toBeDefined();
    expect(matchingTicket?.reason).toContain('torn Coconut Crunch packet');

    // 5. Admin WhatsApp received full context dossier alert with transcript
    const calls = vi.mocked(mockWhatsAppProvider.sendMessage).mock.calls;
    const adminAlert = calls.find(
      (c) => c[0].to === '919999988888' && c[0].body?.includes('Support Escalation Alert'),
    );
    expect(adminAlert).toBeDefined();
    expect(adminAlert?.[0].body).toContain('Customer received torn Coconut Crunch packet');
    expect(adminAlert?.[0].body).toContain('Conversation Transcript:');
    expect(adminAlert?.[0].body).toContain('Order History:');
    expect(adminAlert?.[0].body).toContain('wa.me/919876543299');

    // 6. Customer received interactive message with only Resume Bot button (No Talk to Agent button)
    const customerMessage = calls.find(
      (c) => c[0].to === '919876543299' && c[0].type === 'interactive',
    );
    expect(customerMessage).toBeDefined();
    expect(customerMessage?.[0].buttons?.map((b) => b.id)).toEqual(['btn_resume_bot']);
  });
});
