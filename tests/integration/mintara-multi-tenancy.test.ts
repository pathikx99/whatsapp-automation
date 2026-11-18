import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  getMultiTenantRepository,
  MultiTenantRepository,
  getEnterpriseRepository,
  EnterpriseRepository,
  DatabaseRouter,
} from '@whatsapp-platform/database';
import {
  getAiOrchestrator,
  AgentFactory,
  getToolRegistry,
} from '@whatsapp-platform/ai';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';
import { signSupabaseJwt } from '@whatsapp-platform/shared';

describe('Mintara AI Hybrid Multi-Tenancy Platform Tests', () => {
  let multiTenantRepo: MultiTenantRepository;
  let enterpriseRepo: EnterpriseRepository;
  const adminApiKey = 'MintaraBites@010101';

  beforeAll(() => {
    process.env.ADMIN_API_KEY = adminApiKey;
    process.env.APP_ENV = 'production';
    process.env.SUPABASE_JWT_SECRET = 'mintara-test-jwt-secret-32-chars-long!';
    resetConfigCache();
  });

  beforeEach(() => {
    multiTenantRepo = getMultiTenantRepository();
    enterpriseRepo = getEnterpriseRepository();
  });

  // ===========================================================================
  // 1. MULTI-TENANT LIFECYCLE (Draft -> Onboarding -> Validation -> Active)
  // ===========================================================================
  describe('Tenant Lifecycle & Provisioning Engine', () => {
    it('creates external SaaS tenant with starter subscription in draft state', async () => {
      const slug = `test-brand-${Date.now()}`;
      const tenant = await multiTenantRepo.createTenant({
        name: 'Glow Organics',
        slug,
        tenantType: 'saas',
        industryProfile: 'beauty_personal_care',
        ownerEmail: 'founder@gloworganics.in',
        planId: 'starter',
      });

      expect(tenant.id).toBeDefined();
      expect(tenant.status).toBe('draft');
      expect(tenant.tenantType).toBe('saas');
      expect(tenant.onboardingStep).toBe(1);

      // Verify subscription created
      const subInfo = await multiTenantRepo.getSubscription(tenant.id);
      expect(subInfo).not.toBeNull();
      expect(subInfo?.plan.id).toBe('starter');
      expect(subInfo?.subscription.status).toBe('trialing');

      // Verify initial configuration version snapshot created
      const config = await multiTenantRepo.getLatestConfiguration(tenant.id);
      expect(config).not.toBeNull();
      expect(config?.version).toBe(1);
    });

    it('progresses onboarding step and prevents activation if requirements missing', async () => {
      const slug = `incomplete-brand-${Date.now()}`;
      const tenant = await multiTenantRepo.createTenant({
        name: 'Incomplete Brand',
        slug,
        tenantType: 'saas',
      });

      // Update to step 3
      const updated = await multiTenantRepo.updateOnboardingStep(tenant.id, 3, {
        supportEmail: 'care@incomplete.in',
      });
      expect(updated.onboardingStep).toBe(3);
      expect(updated.status).toBe('onboarding');

      // Attempt activation without owner
      await expect(multiTenantRepo.activateTenant(tenant.id)).rejects.toThrow(
        /Cannot activate tenant/
      );
    });

    it('validates and activates tenant when requirements are satisfied', async () => {
      const slug = `ready-brand-${Date.now()}`;
      const tenant = await multiTenantRepo.createTenant({
        name: 'Ready Food Co',
        slug,
        tenantType: 'internal',
        industryProfile: 'food_beverage',
        ownerEmail: 'chef@readyfood.in',
      });

      const readiness = await multiTenantRepo.validateTenantReadiness(tenant.id);
      expect(readiness.ready).toBe(true);
      expect(readiness.missing.length).toBe(0);

      const activated = await multiTenantRepo.activateTenant(tenant.id, 'owner@mintarabites.com');
      expect(activated.status).toBe('active');
    });

    it('supports controlled suspension and reactivation preserving data', async () => {
      const slug = `suspendable-${Date.now()}`;
      const tenant = await multiTenantRepo.createTenant({
        name: 'Suspendable Brand',
        slug,
        tenantType: 'saas',
        ownerEmail: 'owner@suspendable.com',
      });
      await multiTenantRepo.activateTenant(tenant.id);

      // Suspend
      const suspended = await multiTenantRepo.suspendTenant(
        tenant.id,
        'Overdue subscription invoice',
        'billing@mintara.ai'
      );
      expect(suspended.status).toBe('suspended');

      // Reactivate
      const reactivated = await multiTenantRepo.updateTenantStatus(
        tenant.id,
        'active',
        'Payment received',
        'billing@mintara.ai'
      );
      expect(reactivated.status).toBe('active');
    });
  });

  // ===========================================================================
  // 2. CROSS-TENANT DATA ISOLATION & ACCESS BOUNDARIES
  // ===========================================================================
  describe('Cross-Tenant Data Isolation & Security Boundaries', () => {
    it('strictly isolates customer segments between tenants', async () => {
      const tenantA = '00000000-0000-0000-0000-000000000001'; // Mintara Bites
      const tenantB = 'ten_saas_organic_glow_99';

      // Seed segment for Tenant B
      await enterpriseRepo.createCustomerSegment({
        tenantId: tenantB,
        name: 'Sensitive Skin VIPs',
        slug: 'sensitive-skin-vips',
        description: 'High LTV Organic Beauty customers',
        criteria: { ltv: 5000 },
      });

      // Query for Tenant A: should NOT contain Tenant B segment
      const segmentsA = await enterpriseRepo.listCustomerSegments(tenantA);
      expect(segmentsA.some((s) => s.slug === 'sensitive-skin-vips')).toBe(false);

      // Query for Tenant B: should contain its own segment
      const segmentsB = await enterpriseRepo.listCustomerSegments(tenantB);
      expect(segmentsB.some((s) => s.slug === 'sensitive-skin-vips')).toBe(true);
    });

    it('strictly isolates level 3 approval requests between tenants', async () => {
      const tenantA = '00000000-0000-0000-0000-000000000001';
      const tenantB = 'ten_saas_fashion_99';

      await enterpriseRepo.createApprovalRequest({
        initiatingAgent: 'procurement_agent',
        actionType: 'purchase_order',
        targetEntityType: 'purchase_order',
        targetEntityId: 'PO-FASHION-01',
        parameters: { fabric: 'Organic Cotton' },
        businessReason: 'New summer drop',
        financialImpact: 85000,
        recommendation: 'Approve bulk fabric purchase',
      });
      // The default went to defaultTenantId (tenantA)

      const approvalsA = await enterpriseRepo.listApprovalRequests(undefined, tenantA);
      const approvalsB = await enterpriseRepo.listApprovalRequests(undefined, tenantB);

      expect(approvalsA.some((a) => a.targetEntityId === 'PO-FASHION-01')).toBe(true);
      expect(approvalsB.some((a) => a.targetEntityId === 'PO-FASHION-01')).toBe(false);
    });
  });

  // ===========================================================================
  // 3. HYBRID DATABASE ROUTING ENGINE
  // ===========================================================================
  describe('Hybrid Database Routing Engine (Shared vs Dedicated)', () => {
    it('routes shared tenants to primary shared Supabase client', async () => {
      const client = DatabaseRouter.getClientForTenant('00000000-0000-0000-0000-000000000001', {
        id: 'route_1',
        tenantId: '00000000-0000-0000-0000-000000000001',
        isolationMode: 'shared',
        schemaName: 'public',
        maxConnections: 10,
        connectionTimeoutMs: 5000,
        healthStatus: 'healthy',
        lastHealthCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(client).toBeDefined();
    });

    it('tests database route connectivity with latency report', async () => {
      const route = await multiTenantRepo.setDatabaseRoute({
        tenantId: '00000000-0000-0000-0000-000000000001',
        isolationMode: 'shared',
      });
      expect(route.isolationMode).toBe('shared');

      const testResult = await multiTenantRepo.testDatabaseRoute('00000000-0000-0000-0000-000000000001');
      expect(testResult.status).toBe('healthy');
      expect(testResult.latencyMs).toBeGreaterThanOrEqual(0);
      expect(testResult.isolationMode).toBe('shared');
    });
  });

  // ===========================================================================
  // 4. MULTI-TENANT RBAC & CONTROL PLANE ACCESS CONTROLS
  // ===========================================================================
  describe('Multi-Tenant RBAC & Security Middleware', () => {
    it('permits platform owner to access control plane overview API', async () => {
      const app = await buildServer({ disableRequestLogging: true });
      const ownerToken = signSupabaseJwt({
        sub: '10000000-0000-0000-0000-000000000001',
        email: 'owner@mintarabites.com',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/platform/overview',
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.status).toBe('healthy');
      expect(json.tenants.total).toBeGreaterThanOrEqual(2);
      expect(json.tenants.internal).toBeGreaterThanOrEqual(1);
    });

    it('blocks non-platform users from accessing platform control plane', async () => {
      const app = await buildServer({ disableRequestLogging: true });
      const externalToken = signSupabaseJwt({
        sub: 'usr_external_99',
        email: 'external_viewer@customerbrand.in',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/platform/overview',
        headers: {
          authorization: `Bearer ${externalToken}`,
        },
      });

      // User has no platform role and no membership in platform tenant
      expect([403, 404]).toContain(res.statusCode);
    });

    it('enforces team member quota on workspace invitations', async () => {
      const ownerUserId = `usr_owner_${Date.now()}`;
      const tenant = await multiTenantRepo.createTenant({
        name: 'Quota Brand',
        slug: `quota-brand-${Date.now()}`,
        tenantType: 'saas',
        planId: 'starter', // Starter allows max 2 team members
        ownerUserId,
        ownerEmail: 'owner@quotabrand.in',
      });

      const ownerToken = signSupabaseJwt({
        sub: ownerUserId,
        email: 'owner@quotabrand.in',
      });

      const app = await buildServer({ disableRequestLogging: true });

      // First member invitation: allowed (now 2 members: owner + member1)
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/workspace/invitations',
        headers: {
          authorization: `Bearer ${ownerToken}`,
          'x-tenant-id': tenant.id,
        },
        payload: {
          email: 'member1@quotabrand.in',
          role: 'business_support',
        },
      });
      expect(res1.statusCode).toBe(201);

      // Accept first invitation to fill quota to 2
      const json1 = JSON.parse(res1.payload);
      await multiTenantRepo.acceptInvitation(json1.invitation.token, 'usr_m1');

      // Second member invitation: exceeds Starter limit (2), should be blocked with 403
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/workspace/invitations',
        headers: {
          authorization: `Bearer ${ownerToken}`,
          'x-tenant-id': tenant.id,
        },
        payload: {
          email: 'member2@quotabrand.in',
          role: 'business_support',
        },
      });
      expect(res2.statusCode).toBe(403);
      const json2 = JSON.parse(res2.payload);
      expect(json2.error).toBe('QuotaExceeded');
    });
  });

  // ===========================================================================
  // 5. SAAS USAGE METERING & QUOTAS
  // ===========================================================================
  describe('SaaS Metering & Quotas Enforcement', () => {
    it('records AI tokens and message usage and verifies quota health', async () => {
      const tenantId = '00000000-0000-0000-0000-000000000001';

      await multiTenantRepo.recordUsage(tenantId, 'ai_tokens', 15000);
      await multiTenantRepo.recordUsage(tenantId, 'messages', 5);

      const usage = await multiTenantRepo.getUsage(tenantId);
      expect(usage.totalAiTokensConsumed).toBeGreaterThanOrEqual(15000);
      expect(usage.totalMessagesSent).toBeGreaterThanOrEqual(5);

      const quotaCheck = await multiTenantRepo.checkQuota(tenantId, 'ai_tokens');
      expect(quotaCheck.allowed).toBe(true);
      expect(quotaCheck.limit).toBe(10000000); // Enterprise plan: 10M tokens
    });
  });

  // ===========================================================================
  // 6. PLATFORM OWNER AI ASSISTANT & PRIVACY ISOLATION
  // ===========================================================================
  describe('Platform Owner AI Assistant & Privacy Isolation', () => {
    it('configures platform_owner_assistant with zero customer PII tools', () => {
      const agent = AgentFactory.getAgent('platform_owner_assistant');
      expect(agent).toBeDefined();
      expect(agent.displayName).toBe('Platform Owner Executive Assistant');

      // Permitted platform control tools
      expect(agent.isToolPermitted('get_platform_overview')).toBe(true);
      expect(agent.isToolPermitted('list_platform_tenants')).toBe(true);
      expect(agent.isToolPermitted('get_tenant_status')).toBe(true);
      expect(agent.isToolPermitted('get_system_health')).toBe(true);

      // FORBIDDEN customer PII tools
      expect(agent.isToolPermitted('get_customer_profile')).toBe(false);
      expect(agent.isToolPermitted('get_customer_orders')).toBe(false);
      expect(agent.isToolPermitted('get_order_details')).toBe(false);
    });

    it('executes get_platform_overview tool and returns aggregated metrics without PII', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_platform_overview');
      expect(tool).toBeDefined();

      const result = await tool!.execute({}, { agentRole: 'platform_owner_assistant' });
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalTenants).toBeGreaterThanOrEqual(1);
      expect(data.totalAiTokensConsumed).toBeGreaterThanOrEqual(0);
      // Zero PII
      expect(data.customers).toBeUndefined();
      expect(data.orders).toBeUndefined();
    });
  });

  // ===========================================================================
  // 7. ZERO-PII AUDITED SUPPORT IMPERSONATION SESSION
  // ===========================================================================
  describe('Zero-PII Support Access Auditing', () => {
    it('creates and ends audited support impersonation session', async () => {
      const targetTenantId = '00000000-0000-0000-0000-000000000001';
      const session = await multiTenantRepo.startSupportAccessSession(
        '10000000-0000-0000-0000-000000000001',
        'owner@mintarabites.com',
        targetTenantId,
        'Investigating Shiprocket tracking link discrepancy'
      );

      expect(session.id).toBeDefined();
      expect(session.sessionStartedAt).toBeDefined();
      expect(session.sessionEndedAt).toBeUndefined();

      const ended = await multiTenantRepo.endSupportAccessSession(session.id);
      expect(ended).not.toBeNull();
      expect(ended?.sessionEndedAt).toBeDefined();

      // Check audit log recorded
      const logs = await multiTenantRepo.listPlatformAuditLogs(targetTenantId);
      expect(
        logs.some((l) => l.action === 'platform_support_impersonation_started')
      ).toBe(true);
      expect(
        logs.some((l) => l.action === 'platform_support_impersonation_ended')
      ).toBe(true);
    });
  });
});
