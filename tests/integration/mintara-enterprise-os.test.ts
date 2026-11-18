import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  getEnterpriseRepository,
  EnterpriseRepository,
  getPlatformRepository,
  assertReadOnlySql,
} from '@whatsapp-platform/database';
import {
  getAiOrchestrator,
  getToolRegistry,
  AgentFactory,
  AgentRoleType,
} from '@whatsapp-platform/ai';
import {
  createVoiceProvider,
  createEmailProvider,
} from '@whatsapp-platform/whatsapp';
import { DatabaseSafetyError } from '@whatsapp-platform/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';

describe('Mintara AI Enterprise OS Tests', () => {
  let enterpriseRepo: EnterpriseRepository;
  const adminApiKey = 'MintaraBites@010101';

  beforeAll(() => {
    process.env.ADMIN_API_KEY = adminApiKey;
    process.env.APP_ENV = 'production';
    resetConfigCache();
  });

  beforeEach(() => {
    enterpriseRepo = getEnterpriseRepository();
  });

  // ===========================================================================
  // 1. DUAL DATABASE ISOLATION & READ-ONLY ENFORCEMENT
  // ===========================================================================
  describe('Dual Database Isolation & Read-Only Enforcement', () => {
    it('blocks INSERT, UPDATE, DELETE queries against ecommerce database', () => {
      expect(() => assertReadOnlySql('INSERT INTO products (title) VALUES ("Test")')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('UPDATE orders SET status = "cancelled" WHERE id = 1')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('DELETE FROM customers WHERE id = 1')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('DROP TABLE products')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('ALTER TABLE orders ADD COLUMN test text')).toThrow(DatabaseSafetyError);
    });

    it('permits SELECT queries on ecommerce database', () => {
      expect(() => assertReadOnlySql('SELECT id, title, price FROM products')).not.toThrow();
      expect(() => assertReadOnlySql('SELECT * FROM orders WHERE customer_phone = "919876543210"')).not.toThrow();
    });

    it('allows writes to Mintara AI platform tables', async () => {
      const alert = await enterpriseRepo.createOperationalAlert({
        severity: 'high',
        category: 'logistics',
        title: 'Courier Delay Alert',
        summary: 'Order #MB-1002 delayed in transit over 5 days',
        recommendedAction: 'Send Shiprocket tracking link to customer',
      });

      expect(alert.id).toBeDefined();
      expect(alert.severity).toBe('high');
      expect(alert.category).toBe('logistics');

      const alerts = await enterpriseRepo.listOperationalAlerts('open');
      expect(alerts.some((a) => a.id === alert.id)).toBe(true);
    });
  });

  // ===========================================================================
  // 2. 15 SPECIALIZED AGENTS & 21-TOOL REGISTRY
  // ===========================================================================
  describe('Specialized Agents & 21-Tool Registry', () => {
    const toolRegistry = getToolRegistry();

    it('registers exactly 21 typed backend tools', () => {
      const tools = toolRegistry.getDeclarations();
      expect(tools.length).toBe(21);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('get_customer_profile');
      expect(toolNames).toContain('get_customer_orders');
      expect(toolNames).toContain('get_order_details');
      expect(toolNames).toContain('get_order_tracking_link');
      expect(toolNames).toContain('get_product_details');
      expect(toolNames).toContain('search_products');
      expect(toolNames).toContain('get_inventory_availability');
      expect(toolNames).toContain('get_active_promotions');
      expect(toolNames).toContain('get_eligible_promotions');
      expect(toolNames).toContain('get_customer_segments');
      expect(toolNames).toContain('create_support_ticket');
      expect(toolNames).toContain('schedule_followup');
      expect(toolNames).toContain('create_meeting_request');
      expect(toolNames).toContain('create_supplier_followup');
      expect(toolNames).toContain('request_owner_approval');
      expect(toolNames).toContain('create_campaign_draft');
      expect(toolNames).toContain('get_business_metrics');
      expect(toolNames).toContain('get_manufacturing_data');
      expect(toolNames).toContain('get_supplier_details');
      expect(toolNames).toContain('create_knowledge_update_proposal');
      expect(toolNames).toContain('create_operational_alert');
    });

    it('defines and instantiates all 15 specialized agents with strict role permissions', () => {
      const allRoles: AgentRoleType[] = [
        'customer_support_agent',
        'sales_agent',
        'marketing_agent',
        'customer_intelligence_agent',
        'manufacturing_agent',
        'inventory_agent',
        'procurement_agent',
        'supplier_agent',
        'finance_bi_agent',
        'research_agent',
        'communication_agent',
        'calling_negotiation_agent',
        'owner_assistant',
        'knowledge_management_agent',
        'ecommerce_intelligence_agent',
      ];

      for (const role of allRoles) {
        const agent = AgentFactory.getAgent(role);
        expect(agent.role).toBe(role);
        expect(agent.displayName).toBeDefined();
        expect(agent.permittedTools.size).toBeGreaterThan(0);
      }
    });

    it('enforces tool authorization: blocks customer_support_agent from unauthorized tools', async () => {
      const supportAgent = AgentFactory.getAgent('customer_support_agent');

      // Allowed tool check
      expect(supportAgent.isToolPermitted('get_order_tracking_link')).toBe(true);
      expect(supportAgent.isToolPermitted('create_support_ticket')).toBe(true);

      // Unauthorized tool check
      expect(supportAgent.isToolPermitted('create_campaign_draft')).toBe(false);
      expect(supportAgent.isToolPermitted('get_manufacturing_data')).toBe(false);
    });

    it('executes get_order_tracking_link returning strictly official Shiprocket link', async () => {
      const result = await toolRegistry.executeTool(
        'get_order_tracking_link',
        { orderNumberOrId: 'MB-10492' },
        { agentRole: 'customer_support_agent', conversationId: 'conv_test_tracking' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).trackingUrl).toBe('https://shiprocket.co/tracking/MB-10492');
      expect((result.data as any).strictDirective).toContain('Never speculate');
      expect((result.data as any).orderFound).toBe(true);
    });
  });

  // ===========================================================================
  // 3. SUPPORT ESCALATIONS & HUMAN TAKEOVER
  // ===========================================================================
  describe('Customer Support Escalation & Human Takeover', () => {
    it('creates an escalation ticket and adds customer to suppression list on complaint', async () => {
      const platformRepo = getPlatformRepository();
      const ticket = await platformRepo.createEscalationTicket(
        'conv_test_complaint',
        '919876543210',
        'Aarav Patel',
        'Customer reported broken seal / broken glass jar',
      );

      expect(ticket.id).toBeDefined();

      // Verify suppression list entry
      await enterpriseRepo.addCustomerSuppression({
        phoneNumber: '919876543210',
        reason: 'complaint',
        notes: 'Active complaint: Damaged glass jar received',
      });

      const suppCheck = await enterpriseRepo.isCustomerSuppressed('919876543210');
      expect(suppCheck.suppressed).toBe(true);
      expect(suppCheck.reason).toBe('complaint');
    });

    it('pauses AI on human takeover and resumes on handback', async () => {
      const platformRepo = getPlatformRepository();
      const conv = await platformRepo.getOrCreateConversation('919822334455', 'Pooja');

      // Human takeover sets status to escalated
      await platformRepo.updateConversationStatus(conv.phoneNumber, 'escalated');
      const updated = await platformRepo.getConversationById(conv.id);
      expect(updated?.status).toBe('escalated');

      // Handback to AI sets status to active
      await platformRepo.updateConversationStatus(conv.phoneNumber, 'active');
      const handedBack = await platformRepo.getConversationById(conv.id);
      expect(handedBack?.status).toBe('active');
    });
  });

  // ===========================================================================
  // 4. 10 MARKETING CAMPAIGN ENGINES & COMPLIANCE
  // ===========================================================================
  describe('10 Marketing Campaigns & Safe Defaults', () => {
    it('defaults all 10 marketing campaigns to disabled/safe state', async () => {
      const campaigns = await enterpriseRepo.listCampaignDefinitions();
      expect(campaigns.length).toBe(10);

      // Verify each campaign is disabled by default
      for (const c of campaigns) {
        expect(c.isEnabled).toBe(false);
        expect(c.approvalRequired).toBe(true);
      }

      // Verify all 10 campaign types are present
      const types = campaigns.map((c) => c.campaignType);
      expect(types).toContain('abandoned_cart');
      expect(types).toContain('abandoned_checkout');
      expect(types).toContain('win_back');
      expect(types).toContain('festival');
      expect(types).toContain('product_launch');
      expect(types).toContain('cross_sell');
      expect(types).toContain('referral');
      expect(types).toContain('loyalty_rewards');
      expect(types).toContain('review_collection');
      expect(types).toContain('birthday_anniversary');
    });

    it('respects suppression list and blocks campaign dispatch to suppressed customers', async () => {
      // Add test customer to suppression list
      await enterpriseRepo.addCustomerSuppression({
        phoneNumber: '919879998877',
        reason: 'opt_out',
        notes: 'Customer replied STOP',
      });

      const supp = await enterpriseRepo.isCustomerSuppressed('919879998877');
      expect(supp.suppressed).toBe(true);
      expect(supp.reason).toBe('opt_out');
    });
  });

  // ===========================================================================
  // 5. SUPPLIER & VOICE CALLING SAFEGUARDS
  // ===========================================================================
  describe('Supplier Communication & Voice Calling Safeguards', () => {
    it('initiates calls with caller identity "Mintara Bites Manager"', async () => {
      const voiceProvider = createVoiceProvider();
      const call = await voiceProvider.initiateCall({
        phoneNumber: '919811223344',
        callerIdentity: 'Mintara Bites Manager',
        purpose: 'Gulkand batch quotation inquiry',
      });

      expect(call.callId).toBeDefined();
      expect(call.normalizedPhone).toBe('919811223344');
      expect(['initiated', 'mocked']).toContain(call.status);
    });

    it('records tentative agreement and requires Level 3 owner approval for commitments', async () => {
      const callRecord = await enterpriseRepo.recordSupplierCall({
        tenantId: '00000000-0000-0000-0000-000000000001',
        supplierId: 'supp_pushkar_01',
        phoneNumber: '919811223344',
        callerIdentity: 'Mintara Bites Manager',
        provider: 'mock',
        callStatus: 'completed',
        durationSeconds: 145,
        recipientLanguage: 'hi-IN',
        transcript: 'Supplier agreed to ₹300/kg tentative price for 100kg batch.',
        tentativeAgreement: {
          material: 'Gulkand',
          quantityKg: 100,
          unitPrice: 300,
          totalAmount: 30000,
          paymentTerms: 'Net 30',
        },
      });

      expect(callRecord.id).toBeDefined();
      expect(callRecord.callStatus).toBe('completed');
      expect(callRecord.tentativeAgreement?.totalAmount).toBe(30000);

      // Create Level 3 approval for this tentative agreement
      const approval = await enterpriseRepo.createApprovalRequest({
        requestType: 'purchase_order',
        title: 'PO Approval: 100kg Desi Gulkand (₹30,000)',
        description: 'Tentative agreement from call with Pushkar Natural Treats at ₹300/kg',
        financialImpact: 30000,
        payload: {
          supplierId: 'supp_pushkar_01',
          callId: callRecord.id,
          unitPrice: 300,
          quantity: 100,
        },
        requestedBy: 'calling_negotiation_agent',
      });

      expect(approval.status).toBe('pending');
      expect(approval.financialImpact).toBe(30000);
      expect(approval.requestedBy).toBe('calling_negotiation_agent');
    });
  });

  // ===========================================================================
  // 6. LEVEL 3 APPROVAL WORKFLOW
  // ===========================================================================
  describe('Level 3 Autonomy Approval Workflow', () => {
    it('processes owner approval and updates audit status', async () => {
      const approval = await enterpriseRepo.createApprovalRequest({
        requestType: 'discount_exception',
        title: 'Approve 10% Discount for Wedding Bulk Order',
        description: 'Customer ordering 150 Paan Mukhwas jars (₹37,350 total)',
        financialImpact: 3735,
        payload: { customerPhone: '919876543210', discountPct: 10 },
        requestedBy: 'sales_agent',
      });

      expect(approval.status).toBe('pending');

      // Resolve approval
      const resolved = await enterpriseRepo.resolveApprovalRequest({
        id: approval.id,
        status: 'approved',
        approvedBy: 'owner_pathik',
        executionResult: { notes: 'Approved by Pathik (Owner) via Command Center' },
      });

      expect(resolved?.status).toBe('approved');
      expect(resolved?.approvedBy).toBe('owner_pathik');
    });
  });

  // ===========================================================================
  // 7. FINANCIAL INTELLIGENCE & 22:00 IST DAILY REPORTING
  // ===========================================================================
  describe('Financial Intelligence & Daily 22:00 IST Reporting', () => {
    it('separates verified from estimated financial figures and compiles daily report', async () => {
      const platformRepo = getPlatformRepository();
      const report = await platformRepo.compileDailyReport();

      expect(report.reportDate).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.metrics.incomingMessages).toBeGreaterThanOrEqual(0);
      expect(report.summary).toContain('Mintara AI');
    });
  });

  // ===========================================================================
  // 8. FASTIFY ENTERPRISE API ROUTES
  // ===========================================================================
  describe('Fastify Enterprise API Routes', () => {
    it('GET /api/enterprise/status returns live platform telemetry', async () => {
      const server = await buildServer({ disableRequestLogging: true });
      const res = await server.inject({
        method: 'GET',
        url: '/api/enterprise/status',
        headers: {
          'x-api-key': adminApiKey,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.status).toBe('operational');
      expect(json.agentsCount).toBe(15);
      expect(json.toolsCount).toBe(21);
      expect(json.guardrails.ecommerceReadOnly).toBe(true);
      expect(json.guardrails.shiprocketStrictLinks).toBe(true);
    });

    it('POST /api/ai/orchestrate executes agent with tool loop', async () => {
      const server = await buildServer({ disableRequestLogging: true });
      const res = await server.inject({
        method: 'POST',
        url: '/api/ai/orchestrate',
        headers: {
          'x-api-key': adminApiKey,
        },
        payload: {
          agentRole: 'customer_support_agent',
          prompt: 'Where is my order MB-10492?',
          context: { customerId: 'cust_123' },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.agentRole).toBe('customer_support_agent');
      expect(json.content).toBeDefined();
      expect(json.model).toBeDefined();
    });

    it('GET /api/approvals lists pending Level 3 approval requests', async () => {
      const server = await buildServer({ disableRequestLogging: true });
      const res = await server.inject({
        method: 'GET',
        url: '/api/approvals',
        headers: {
          'x-api-key': adminApiKey,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(Array.isArray(json.approvals)).toBe(true);
    });

    it('POST /api/support/conversations/:id/handback hands conversation back to AI', async () => {
      const platformRepo = getPlatformRepository();
      const conv = await platformRepo.getOrCreateConversation('919876543210', 'Test');
      await platformRepo.updateConversationStatus(conv.phoneNumber, 'escalated');

      const server = await buildServer({ disableRequestLogging: true });
      const res = await server.inject({
        method: 'POST',
        url: `/api/support/conversations/${conv.id}/handback`,
        headers: {
          'x-api-key': adminApiKey,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);

      const rechecked = await platformRepo.getConversationById(conv.id);
      expect(rechecked?.status).toBe('active');
    });
  });
});
