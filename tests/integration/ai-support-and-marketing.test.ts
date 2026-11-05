import { describe, it, expect, vi } from 'vitest';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { createEcommerceAdapter } from '../../packages/ecommerce-adapter/src/index.js';
import { WhatsAppProvider } from '../../packages/whatsapp/src/index.js';

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
});
