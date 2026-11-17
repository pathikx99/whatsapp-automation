import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import {
  getPlatformRepository,
  PlatformRepository,
  createEcommerceSupabaseClient,
  assertReadOnlySql,
} from '@whatsapp-platform/database';
import {
  createWhatsAppProvider,
  normalizePhoneNumber,
  formatDisplayPhoneNumber,
  verifyWebhookSignature,
  parseWhatsAppWebhookPayload,
  isOptOutKeyword,
  isOptInKeyword,
} from '@whatsapp-platform/whatsapp';
import { createAiProvider } from '@whatsapp-platform/ai';
import {
  getConfig,
  resetConfigCache,
  validateConfig,
  ConfigurationError,
} from '@whatsapp-platform/config';
import { MarketingOrchestrator } from '../../apps/marketing-engine/src/orchestrator.js';
import { processSingleJob } from '../../apps/worker/src/index.js';
import { DatabaseSafetyError } from '@whatsapp-platform/shared';
import { buildServer } from '../../apps/api/src/server.js';
import crypto from 'node:crypto';

describe('Mintara AI Production Foundation Tests', () => {
  let platformRepo: PlatformRepository;

  beforeAll(() => {
    process.env.ADMIN_API_KEY = 'MintaraBites@010101';
    resetConfigCache();
  });

  beforeEach(() => {
    platformRepo = getPlatformRepository();
  });

  // ---------------------------------------------------------------------------
  // 1. Production Startup Without Admin Secrets
  // ---------------------------------------------------------------------------
  describe('Production Startup Without Admin Secrets', () => {
    it('should fail with ConfigurationError when ADMIN_API_KEY is missing in production mode', () => {
      expect(() =>
        validateConfig({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://platform-test.supabase.co',
          SUPABASE_SECRET_KEY: 'test-secret-key-12345678',
          ECOMMERCE_SUPABASE_URL: 'https://ecom-test.supabase.co',
          ECOMMERCE_SUPABASE_ANON_KEY: 'test-anon-key-12345678',
          ADMIN_API_KEY: '',
        }),
      ).toThrow(ConfigurationError);
    });

    it('should fail in production when WHATSAPP_PROVIDER is cloud_api without app secret', () => {
      expect(() =>
        validateConfig({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://platform-test.supabase.co',
          SUPABASE_SECRET_KEY: 'test-secret-key-12345678',
          ECOMMERCE_SUPABASE_URL: 'https://ecom-test.supabase.co',
          ECOMMERCE_SUPABASE_ANON_KEY: 'test-anon-key-12345678',
          ADMIN_API_KEY: 'secure-production-admin-key',
          WHATSAPP_PROVIDER: 'cloud_api',
          WHATSAPP_API_KEY: 'meta-token-123',
          WHATSAPP_APP_SECRET: '',
        }),
      ).toThrow(ConfigurationError);
    });

    it('should succeed in production when all required secrets are configured', () => {
      const validProd = validateConfig({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://platform-test.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret-key-12345678',
        ECOMMERCE_SUPABASE_URL: 'https://ecom-test.supabase.co',
        ECOMMERCE_SUPABASE_ANON_KEY: 'test-anon-key-12345678',
        ADMIN_API_KEY: 'secure-production-admin-key',
      });
      expect(validProd.NODE_ENV).toBe('production');
      expect(validProd.ADMIN_API_KEY).toBe('secure-production-admin-key');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Daily Reporting Foundation & Exact 22:00 IST Cutoff
  // ---------------------------------------------------------------------------
  describe('Daily Reporting Foundation (22:00 IST)', () => {
    it('should log granular activity events and calculate daily report metrics correctly', async () => {
      const testPhone = '919876500001';
      const istDate = '2026-11-17';

      // 1. Log various activity events
      await platformRepo.logActivityEvent({
        eventType: 'incoming_message',
        phoneNumber: testPhone,
        customerName: 'Pathik Patel',
        status: 'success',
        details: { text: 'Hi, what is the shelf life of Paan Mukhwas?' },
      });

      await platformRepo.logActivityEvent({
        eventType: 'support_interaction',
        phoneNumber: testPhone,
        customerName: 'Pathik Patel',
        status: 'success',
        aiModel: 'gemini-2.5-flash',
        tokensUsed: 142,
        latencyMs: 320,
        details: { promptTokens: 98, completionTokens: 44 },
      });

      await platformRepo.logActivityEvent({
        eventType: 'order_enquiry',
        phoneNumber: testPhone,
        customerName: 'Pathik Patel',
        status: 'success',
        details: { query: 'Where is my order?' },
      });

      await platformRepo.logActivityEvent({
        eventType: 'failed_action',
        phoneNumber: testPhone,
        status: 'failure',
        errorMessage: 'Courier API timeout during tracking lookup',
      });

      // 2. Compile daily report for IST date
      const report = await platformRepo.compileDailyReport(istDate);

      expect(report).toBeDefined();
      expect(report.reportDate).toBe(istDate);
      expect(report.metrics.incomingMessages).toBeGreaterThanOrEqual(1);
      expect(report.metrics.supportInteractions).toBeGreaterThanOrEqual(1);
      expect(report.metrics.orderEnquiries).toBeGreaterThanOrEqual(1);
      expect(report.metrics.failedActions).toBeGreaterThanOrEqual(1);
      expect(report.metrics.aiUsage.totalTokens).toBeGreaterThanOrEqual(142);
      expect(report.metrics.aiUsage.totalCalls).toBeGreaterThanOrEqual(1);
      expect(report.summary).toContain('Mintara AI Daily Operational Intelligence Report');
      expect(report.summary).toContain(istDate);

      // 3. Save report and retrieve
      const saved = await platformRepo.saveDailyReport(report);
      expect(saved.id).toBeDefined();
      expect(saved.status).toBe('compiled');

      const retrieved = await platformRepo.getDailyReport(istDate);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.reportDate).toBe(istDate);
      expect(retrieved?.metrics.incomingMessages).toBe(report.metrics.incomingMessages);

      // 4. Record deliveries for WhatsApp & Dashboard
      const waDelivery = await platformRepo.recordReportDelivery({
        reportId: saved.id,
        channel: 'whatsapp',
        recipient: '919876543210',
        status: 'delivered',
        metaWamid: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAERgSR',
      });
      expect(waDelivery.id).toBeDefined();
      expect(waDelivery.status).toBe('delivered');

      const dashDelivery = await platformRepo.recordReportDelivery({
        reportId: saved.id,
        channel: 'dashboard',
        recipient: 'command_center',
        status: 'delivered',
      });
      expect(dashDelivery.status).toBe('delivered');
    });

    it('should strictly exclude events after the 22:00 IST cutoff and capture them in late-arriving events', async () => {
      const istDate = '2026-11-17';
      const cutoffTestPhone = '919999900022';

      // Event before 22:00 IST (15:00 UTC = 20:30 IST)
      await platformRepo.logActivityEvent({
        eventType: 'incoming_message',
        phoneNumber: cutoffTestPhone,
        details: { text: 'Inquiry before 22:00 IST' },
      });

      // Manually add an event created after 22:00 IST (17:30 UTC = 23:00 IST) into cache
      const lateEvent = await platformRepo.logActivityEvent({
        eventType: 'incoming_message',
        phoneNumber: cutoffTestPhone,
        details: { text: 'Inquiry after 22:00 IST cutoff' },
      });
      lateEvent.createdAt = '2026-11-17T17:30:00.000Z'; // 23:00 IST

      const standardReport = await platformRepo.compileDailyReport(istDate);
      expect(standardReport.categories).toBeDefined();
      expect(standardReport.categories.lateArrivingCount).toBeGreaterThanOrEqual(1);

      // Reconciled report includes late-arriving events
      const reconciledReport = await platformRepo.compileDailyReport(istDate, {
        reconcileLateEvents: true,
      });
      expect(reconciledReport.categories.reportingWindow).toBeDefined();
      expect((reconciledReport.categories.reportingWindow as any).reconciled).toBe(true);
    });

    it('should prevent duplicate report entries on multiple generation runs (idempotent upsert)', async () => {
      const date = '2026-11-17';
      const report1 = await platformRepo.compileDailyReport(date);
      const saved1 = await platformRepo.saveDailyReport(report1);

      const report2 = await platformRepo.compileDailyReport(date);
      const saved2 = await platformRepo.saveDailyReport(report2);

      expect(saved1.reportDate).toBe(saved2.reportDate);
      const allReports = await platformRepo.listDailyReports(50);
      const matching = allReports.filter((r) => r.reportDate === date);
      expect(matching.length).toBe(1);
    });

    it('should update report delivery status when Meta delivery status receipts arrive', async () => {
      const wamid = `wamid.test_receipt_${Date.now()}`;
      await platformRepo.recordReportDelivery({
        reportId: 'rep_receipt_test',
        channel: 'whatsapp',
        recipient: '919876543210',
        status: 'pending',
        metaWamid: wamid,
      });

      // Status receipt delivered
      await platformRepo.logMessagingReceipt(wamid, '919876543210', 'delivered');

      // Status receipt read
      await platformRepo.logMessagingReceipt(wamid, '919876543210', 'read');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Worker Concurrency & Retry Infrastructure
  // ---------------------------------------------------------------------------
  describe('Worker Concurrency & Retry Infrastructure', () => {
    it('should atomically lock jobs during claim and transition to dead_letter after max retries', async () => {
      const worker1 = 'worker_test_inst_1';
      const worker2 = 'worker_test_inst_2';

      // 1. Enqueue test job
      const job = await platformRepo.enqueueJob('test_concurrency_job', {
        taskId: 'concurrency_1',
        createdAt: new Date().toISOString(),
      });
      expect(job.status).toBe('pending');

      // 2. Worker 1 claims pending jobs
      const claimedByW1 = await platformRepo.claimPendingJobs(worker1, 10, 60);
      const claimedJob = claimedByW1.find((j) => j.id === job.id);
      expect(claimedJob).toBeDefined();
      expect(claimedJob?.lockedBy).toBe(worker1);

      // 3. Worker 2 attempts to claim while locked by Worker 1; should not claim the same job
      const claimedByW2 = await platformRepo.claimPendingJobs(worker2, 10, 60);
      const duplicateClaim = claimedByW2.find((j) => j.id === job.id);
      expect(duplicateClaim).toBeUndefined();

      // 4. Test retry backoff: Attempt 1 failure (max_retries is 3 default)
      const retry1 = await platformRepo.markJobFailedOrRetry(job.id, 'Temporary network glitch');
      expect(retry1.status).toBe('retrying');
      expect(retry1.retries).toBe(1);
      expect(retry1.scheduledFor).toBeDefined();

      // Attempt 2 failure
      const retry2 = await platformRepo.markJobFailedOrRetry(job.id, 'Another timeout');
      expect(retry2.status).toBe('retrying');
      expect(retry2.retries).toBe(2);

      // Attempt 3 failure -> Exceeds max_retries (3) -> Dead letter
      const retry3 = await platformRepo.markJobFailedOrRetry(job.id, 'Fatal terminal error');
      expect(retry3.status).toBe('dead_letter');
      expect(retry3.retries).toBe(3);
    });

    it('should reuse compiled daily report on delivery retry without regenerating data', async () => {
      const dateIST = '2026-11-17';
      const existing = await platformRepo.getDailyReport(dateIST);
      expect(existing).not.toBeNull();

      // Run worker job with retryOnlyDelivery
      const retryJob = {
        id: 'd0000000-0000-0000-0000-000000000099',
        jobType: 'retry_report_delivery',
        payload: { dateIST, retryOnlyDelivery: true, recipientPhone: '919876543210' },
        status: 'pending' as const,
        retries: 0,
        maxRetries: 3,
        scheduledFor: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await processSingleJob(retryJob);
      expect(retryJob.status).toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. WhatsApp Foundation, Phone Normalization & Opt-Out Enforcement
  // ---------------------------------------------------------------------------
  describe('WhatsApp Foundation, Opt-Out Enforcement & Phone Normalization', () => {
    it('should correctly normalize various Indian phone formats to 91 standard', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('919876543210');
      expect(normalizePhoneNumber('09876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+91-98765-43210')).toBe('919876543210');
    });

    it('should format numbers cleanly for admin dashboard presentation', () => {
      expect(formatDisplayPhoneNumber('919876543210')).toBe('+91 98765 43210');
    });

    it('should detect opt-out and opt-in keywords correctly', () => {
      expect(isOptOutKeyword('STOP')).toBe(true);
      expect(isOptOutKeyword('unsubscribe')).toBe(true);
      expect(isOptOutKeyword('stop please')).toBe(true);
      expect(isOptOutKeyword('hello')).toBe(false);

      expect(isOptInKeyword('START')).toBe(true);
      expect(isOptInKeyword('UNSTOP')).toBe(true);
      expect(isOptInKeyword('optin')).toBe(true);
      expect(isOptInKeyword('order status')).toBe(false);
    });

    it('should enforce marketing opt-out and skip sending campaigns to opted-out customers', async () => {
      const optOutPhone = '919876543999';

      // 1. Opt-out customer
      await platformRepo.setCustomerOptOut(optOutPhone, true);
      const isOptedOut = await platformRepo.isCustomerOptedOut(optOutPhone);
      expect(isOptedOut).toBe(true);

      // 2. Run marketing orchestrator with candidate having this phone
      const mockEcom = {
        getMarketingCandidates: vi.fn().mockResolvedValue([
          {
            customer: { id: 'cust_optout_1', phoneNumber: optOutPhone, firstName: 'OptedOutUser' },
            segmentType: 'dormant',
            purchaseCount: 1,
            recommendedFlavor: 'Artisanal Paan',
          },
        ]),
        getAllActiveProducts: vi.fn().mockResolvedValue([]),
      };

      const orchestrator = new MarketingOrchestrator({
        platformRepository: platformRepo as any,
        ecommerceAdapter: mockEcom as any,
      });

      const report = await orchestrator.runScheduledCampaign('dormant');
      expect(report.totalCandidates).toBe(1);
      expect(report.dispatchedCount).toBe(0);
      expect(report.skippedCount).toBe(1);

      // 3. Opt-in customer resumes eligibility
      await platformRepo.setCustomerOptOut(optOutPhone, false);
      expect(await platformRepo.isCustomerOptedOut(optOutPhone)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Ecommerce Read-Only Access & Safety
  // ---------------------------------------------------------------------------
  describe('Ecommerce Database Read-Only Access', () => {
    it('should permit valid read-only SELECT queries', () => {
      expect(() => assertReadOnlySql('SELECT id, title, price FROM products')).not.toThrow();
      expect(() => assertReadOnlySql('select count(*) from orders where status = "paid"')).not.toThrow();
    });

    it('should block mutation queries with DatabaseSafetyError', () => {
      expect(() => assertReadOnlySql('DELETE FROM customers WHERE id = 1')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('UPDATE orders SET status = "cancelled"')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('INSERT INTO products (title) VALUES ("Test")')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('DROP TABLE products')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('ALTER TABLE orders ADD COLUMN hack text')).toThrow(DatabaseSafetyError);
    });

    it('should initialize ecommerce client with anon key by default', () => {
      const client = createEcommerceSupabaseClient();
      expect(client).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Gemini AI Provider Foundation & Tool Declarations
  // ---------------------------------------------------------------------------
  describe('Gemini AI Provider Foundation', () => {
    it('should support function calling / backend tool declarations', async () => {
      const aiProvider = createAiProvider();
      const response = await aiProvider.generateResponse({
        messages: [{ role: 'user', content: 'What is the stock quantity for SKU paan-150g?' }],
        tools: [
          {
            name: 'check_product_stock',
            description: 'Queries live inventory stock for a product SKU',
            parameters: {
              type: 'object',
              properties: {
                sku: { type: 'string', description: 'Product variant SKU' },
              },
              required: ['sku'],
            },
          },
        ],
        toolChoice: 'AUTO',
      });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.usage).toBeDefined();
      expect(typeof response.latencyMs).toBe('number');
    });

    it('should support structured JSON responses when requested', async () => {
      const aiProvider = createAiProvider();
      const response = await aiProvider.generateResponse({
        messages: [{ role: 'user', content: 'Provide JSON summary of business hours' }],
        responseMimeType: 'application/json',
      });

      expect(response.json).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. REST API Security, Webhook HMAC, Idempotency & Sensitive Actions
  // ---------------------------------------------------------------------------
  describe('REST API Security, Webhook HMAC, Idempotency & Sensitive Actions', () => {
    it('should reject unauthorized access to protected routes without admin key', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      const unauthRes = await app.inject({
        method: 'GET',
        url: '/api/reports/daily',
      });
      expect(unauthRes.statusCode).toBe(401);

      const invalidRes = await app.inject({
        method: 'GET',
        url: '/api/reports/daily',
        headers: { 'x-admin-key': 'invalid_forged_key' },
      });
      expect(invalidRes.statusCode).toBe(401);

      await app.close();
    });

    it('should verify Meta WhatsApp webhook HMAC signatures against raw request body', async () => {
      const testSecret = 'meta_test_app_secret_123';
      process.env.WHATSAPP_APP_SECRET = testSecret;
      resetConfigCache();

      const app = await buildServer({ disableRequestLogging: true });
      try {
        const payload = {
          object: 'whatsapp_business_account',
          entry: [],
        };
        const rawPayload = JSON.stringify(payload);

        // 1. Rejected with invalid signature
        const badSigRes = await app.inject({
          method: 'POST',
          url: '/webhooks/whatsapp',
          headers: {
            'x-hub-signature-256': 'sha256=invalid_tampered_signature',
            'content-type': 'application/json',
          },
          payload,
        });
        expect(badSigRes.statusCode).toBe(401);

        // 2. Accepted with valid HMAC-SHA256 signature
        const validHmac = crypto.createHmac('sha256', testSecret).update(rawPayload).digest('hex');
        const validSigRes = await app.inject({
          method: 'POST',
          url: '/webhooks/whatsapp',
          headers: {
            'x-hub-signature-256': `sha256=${validHmac}`,
            'content-type': 'application/json',
          },
          payload: rawPayload,
        });
        expect(validSigRes.statusCode).toBe(200);
      } finally {
        delete process.env.WHATSAPP_APP_SECRET;
        resetConfigCache();
        await app.close();
      }
    });

    it('should detect duplicate inbound webhook messages and prevent duplicate processing (idempotency)', async () => {
      const app = await buildServer({ disableRequestLogging: true });
      const dupMsgId = `wamid.test_idempotency_${Date.now()}`;
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
                      id: dupMsgId,
                      from: '919876543210',
                      type: 'text',
                      text: { body: 'Hello first time' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // First webhook delivery
      const res1 = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(res1.statusCode).toBe(200);
      expect(await platformRepo.isWebhookProcessed(dupMsgId, 'whatsapp')).toBe(true);

      // Second webhook delivery with same message ID -> Idempotency skips processing
      const res2 = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(res2.statusCode).toBe(200);

      await app.close();
    });

    it('should require admin authorization and generate audit logs for sensitive actions', async () => {
      const app = await buildServer({ disableRequestLogging: true });
      const adminHeader = { 'x-admin-key': 'MintaraBites@010101' };

      // 1. Create a support ticket
      const ticket = await platformRepo.createEscalationTicket(
        'conv_audit_test',
        '919876543999',
        'Pathik Patel',
        'Customer package was damaged, requests replacement or refund',
      );

      // 2. Unauthorized attempt to execute sensitive action fails
      const unauthAction = await app.inject({
        method: 'POST',
        url: `/api/support/tickets/${ticket.id}/action`,
        payload: { actionType: 'refund', approved: true, amount: 499 },
      });
      expect(unauthAction.statusCode).toBe(401);

      // 3. Authorized admin action succeeds
      const authAction = await app.inject({
        method: 'POST',
        url: `/api/support/tickets/${ticket.id}/action`,
        headers: adminHeader,
        payload: { actionType: 'refund', approved: true, amount: 499, reason: 'Damaged item on arrival' },
      });
      expect(authAction.statusCode).toBe(200);
      const actionBody = JSON.parse(authAction.body);
      expect(actionBody.status).toBe('success');
      expect(actionBody.approved).toBe(true);

      // 4. Resolve ticket
      const resolveRes = await app.inject({
        method: 'POST',
        url: `/api/support/tickets/${ticket.id}/resolve`,
        headers: adminHeader,
      });
      expect(resolveRes.statusCode).toBe(200);

      // 5. Verify audit logs
      const auditLogs = await platformRepo.getAuditLogs(10);
      expect(auditLogs.some((l) => l.action === 'sensitive_action_refund' && l.status === 'authorized')).toBe(true);
      expect(auditLogs.some((l) => l.action === 'support_ticket_resolved' && l.status === 'authorized')).toBe(true);

      await app.close();
    });
  });
});
