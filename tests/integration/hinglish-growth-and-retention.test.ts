import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBusinessProfile, resetConfigCache } from '@whatsapp-platform/config';
import { SupportOrchestrator } from '../../apps/support-engine/src/orchestrator.js';
import { processSingleJob } from '../../apps/worker/src/index.js';

const { mockSendMessage, mockUpdateJobStatus, mockEnqueueJob } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'test_msg_id' }),
  mockUpdateJobStatus: vi.fn().mockResolvedValue(true),
  mockEnqueueJob: vi.fn().mockImplementation(async (type, payload, scheduledFor) => ({
    id: `mock_job_${type}`,
    jobType: type,
    payload,
    scheduledFor,
    status: 'pending',
  })),
}));

vi.mock('@whatsapp-platform/whatsapp', () => ({
  createWhatsAppProvider: () => ({
    sendMessage: mockSendMessage,
    isConfigured: () => true,
  }),
}));

vi.mock('@whatsapp-platform/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@whatsapp-platform/database')>();
  return {
    ...actual,
    getPlatformRepository: () => ({
      ...actual.getPlatformRepository(),
      updateJobStatus: mockUpdateJobStatus,
      enqueueJob: mockEnqueueJob,
    }),
  };
});

describe('Hinglish Growth, Retention & Fridge Invisibility Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigCache();
  });

  it('should have Hinglish tone instructions and fridge door placement guidance in business profile', () => {
    const profile = getBusinessProfile();
    expect(profile.persona.tone).toContain('Hinglish');
    expect(profile.persona.rules.some((r) => r.includes('fridge door pocket at eye-level'))).toBe(true);
    expect(profile.persona.rules.some((r) => r.includes('weddings, shaadi, bulk gifting'))).toBe(true);
    expect(profile.notifications.orderDelivered.refrigerationNudge).toContain('fridge ke door pocket');
  });

  it('should process fridge_placement_tip worker job and dispatch eye-level fridge placement advice', async () => {
    const job = {
      id: 'a0000000-0000-0000-0000-000000000001',
      jobType: 'fridge_placement_tip',
      status: 'pending',
      payload: {
        customerPhone: '919876543210',
        customerName: 'Priya',
      },
      createdAt: new Date().toISOString(),
    };

    await processSingleJob(job as any);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const sent = mockSendMessage.mock.calls[0][0];
    expect(sent.to).toBe('919876543210');
    expect(sent.body).toContain('fridge ke door pocket me');
    expect(sent.body).toContain('thande paani ki bottle');
    expect(sent.buttons.some((b: any) => b.id === 'btn_fridge_placed')).toBe(true);
    expect(job.status).toBe('completed');
  });

  it('should process dinner_habit_trigger worker job with 9:15 PM craving prompt', async () => {
    const job = {
      id: 'a0000000-0000-0000-0000-000000000002',
      jobType: 'dinner_habit_trigger',
      status: 'pending',
      payload: {
        customerPhone: '919876543210',
        customerName: 'Rahul',
      },
      createdAt: new Date().toISOString(),
    };

    await processSingleJob(job as any);

    expect(mockSendMessage).toHaveBeenCalled();
    const sent = mockSendMessage.mock.calls.at(-1)[0];
    expect(sent.to).toBe('919876543210');
    expect(sent.body).toContain('Plate saaf ho chuki hai na Rahul?');
    expect(sent.body).toContain('chilled chammach');
    expect(sent.buttons.some((b: any) => b.id === 'btn_craving_satisfied')).toBe(true);
    expect(job.status).toBe('completed');
  });

  it('should intercept packaging QR code refill scans and offer fresh batch selection with zero invented discounts', async () => {
    const mockRepo = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv_qr_1', status: 'active' }),
      appendMessage: vi.fn().mockResolvedValue(true),
      getRecentMessages: vi.fn().mockResolvedValue([]),
      getLatestNdrInstruction: vi.fn().mockResolvedValue(null),
    };

    const mockEcom = {
      getCustomerByPhone: vi.fn().mockResolvedValue(null),
      getCustomerOrders: vi.fn().mockResolvedValue([]),
      getAllActiveProducts: vi.fn().mockResolvedValue([]),
      getActivePromotion: vi.fn().mockResolvedValue(null), // Strict test: NO discount in website DB
    };

    const orchestrator = new SupportOrchestrator({
      platformRepository: mockRepo as any,
      ecommerceAdapter: mockEcom as any,
    });

    const res = await orchestrator.processMessage({
      from: '919876543210',
      messageId: 'qr_msg_1',
      body: 'KHATAM_REFILL_CHAHIYE',
      senderName: 'Amit',
    });

    expect(res.action).toBe('answered');
    expect(mockSendMessage).toHaveBeenCalled();
    const sent = mockSendMessage.mock.calls.at(-1)[0];
    expect(sent.body).toContain('Packet khali ho gaya?');
    expect(sent.body).toContain('100% supari-free');
    // Verify NO discount codes are invented or promised
    expect(sent.body).not.toContain('₹50 off');
    expect(sent.body).not.toContain('FRESH50');
    expect(sent.buttons.some((b: any) => b.id === 'btn_size_paan_300g')).toBe(true);
  });

  it('should qualify high-ticket wedding and corporate bulk gifting inquiries and create escalation ticket', async () => {
    const mockRepo = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv_b2b_1', status: 'active' }),
      appendMessage: vi.fn().mockResolvedValue(true),
      createEscalationTicket: vi.fn().mockResolvedValue({ id: 'tkt_b2b_1' }),
      getRecentMessages: vi.fn().mockResolvedValue([]),
      getLatestNdrInstruction: vi.fn().mockResolvedValue(null),
    };

    const mockEcom = {
      getCustomerByPhone: vi.fn().mockResolvedValue(null),
      getCustomerOrders: vi.fn().mockResolvedValue([]),
      getAllActiveProducts: vi.fn().mockResolvedValue([]),
    };

    const orchestrator = new SupportOrchestrator({
      platformRepository: mockRepo as any,
      ecommerceAdapter: mockEcom as any,
    });

    const res = await orchestrator.processMessage({
      from: '919876543299',
      messageId: 'b2b_msg_1',
      body: 'We are looking for wedding hampers for our family reception next month',
      senderName: 'Karan',
    });

    expect(res.action).toBe('answered');
    expect(mockRepo.createEscalationTicket).toHaveBeenCalled();
    const ticketCall = mockRepo.createEscalationTicket.mock.calls[0];
    expect(ticketCall[3]).toContain('B2B_CORPORATE_GIFTING');

    const sent = mockSendMessage.mock.calls.at(-1)[0];
    expect(sent.body).toContain('Shaadi ya corporate gifting');
    expect(sent.body).toContain('boring sweets aur soan papdi');
    expect(sent.buttons.some((b: any) => b.id === 'btn_talk_human')).toBe(true);
  });

  it('should automatically schedule all 5 post-delivery lifecycle stages via schedule-lifecycle API', async () => {
    const { buildServer } = await import('../../apps/api/src/server.js');
    const server = await buildServer({ disableRequestLogging: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/marketing/schedule-lifecycle',
      payload: {
        customerPhone: '919876543210',
        customerName: 'Ananya',
        orderNumber: 'MB-8801',
        items: [
          { name: 'Artisanal Paan Mukhwas (300g)', quantity: 1, unitPrice: 249 },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.scheduledJobs).toHaveLength(5);

    const jobTypes = body.scheduledJobs.map((j: any) => j.type);
    expect(jobTypes).toContain('fridge_placement_tip');
    expect(jobTypes).toContain('dinner_habit_trigger');
    expect(jobTypes).toContain('csat_review_prompt');
    expect(jobTypes).toContain('table_anchor_cross_sell');
    expect(jobTypes).toContain('replenishment_reminder');
  });
});
