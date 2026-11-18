import { FastifyInstance } from 'fastify';
import {
  getMultiTenantRepository,
  TenantType,
  TenantStatus,
  TenantIsolationMode,
  BusinessRole,
} from '@whatsapp-platform/database';
import {
  resolveTenantContext,
  requirePlatformRole,
  requireTenantRole,
} from './tenant-context.js';
import { createLogger } from '@whatsapp-platform/shared';

export function registerMultiTenantRoutes(app: FastifyInstance): void {
  const logger = createLogger({ name: 'multi-tenant-routes' });
  logger.info('Registering Mintara AI Multi-Tenancy Platform routes');
  const multiTenantRepo = getMultiTenantRepository();

  // ===========================================================================
  // 1. PLATFORM CONTROL PLANE APIS (Platform Admins Only)
  // ===========================================================================

  // 1.1 Platform Overview Telemetry
  app.get(
    '/api/platform/overview',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (_req, reply) => {
      const allTenants = await multiTenantRepo.listTenants();
      const internalCount = allTenants.filter((t) => t.tenantType === 'internal').length;
      const saasCount = allTenants.filter((t) => t.tenantType === 'saas').length;
      const activeCount = allTenants.filter((t) => t.status === 'active').length;
      const onboardingCount = allTenants.filter((t) => t.status === 'onboarding' || t.status === 'draft').length;
      const suspendedCount = allTenants.filter((t) => t.status === 'suspended').length;
      const dedicatedDbCount = allTenants.filter((t) => t.isolationMode === 'dedicated').length;

      const platformUsers = await multiTenantRepo.listPlatformUsers();
      const plans = await multiTenantRepo.listSubscriptionPlans();

      // Aggregate current month usage
      let totalTokens = 0;
      let totalConversations = 0;
      for (const t of allTenants) {
        const u = await multiTenantRepo.getUsage(t.id);
        totalTokens += u.totalAiTokensConsumed;
        totalConversations += u.totalConversations;
      }

      return reply.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        tenants: {
          total: allTenants.length,
          internal: internalCount,
          saas: saasCount,
          active: activeCount,
          onboarding: onboardingCount,
          suspended: suspendedCount,
          dedicatedDatabase: dedicatedDbCount,
        },
        users: {
          platformOperators: platformUsers.length,
        },
        usage: {
          billingMonth: new Date().toISOString().substring(0, 7),
          totalAiTokensConsumed: totalTokens,
          totalConversations: totalConversations,
        },
        plansAvailable: plans.length,
      });
    }
  );

  // 1.2 Business Directory (List Tenants)
  app.get(
    '/api/platform/tenants',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const query = req.query as { tenantType?: TenantType; status?: TenantStatus };
      const tenants = await multiTenantRepo.listTenants({
        tenantType: query.tenantType,
        status: query.status,
      });
      return reply.status(200).send({ tenants });
    }
  );

  // 1.3 Create Business / Tenant
  app.post(
    '/api/platform/tenants',
    { preHandler: [resolveTenantContext, requirePlatformRole('platform_owner', 'platform_admin')] },
    async (req, reply) => {
      const body = req.body as {
        name: string;
        slug: string;
        domain?: string;
        tenantType: TenantType;
        industryProfile?: string;
        ownerEmail?: string;
        planId?: string;
        isolationMode?: TenantIsolationMode;
        settings?: Record<string, unknown>;
      };

      if (!body.name || !body.slug || !body.tenantType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequest',
          message: 'name, slug, and tenantType are required fields',
        });
      }

      try {
        const tenant = await multiTenantRepo.createTenant({
          name: body.name,
          slug: body.slug,
          domain: body.domain,
          tenantType: body.tenantType,
          industryProfile: body.industryProfile,
          ownerEmail: body.ownerEmail,
          planId: body.planId,
          isolationMode: body.isolationMode,
          settings: body.settings,
        });

        multiTenantRepo.logPlatformAction({
          actorEmail: req.tenantContext!.userEmail,
          action: 'tenant_created_by_platform_admin',
          targetTenantId: tenant.id,
          entityType: 'tenant',
          entityId: tenant.id,
          details: { name: tenant.name, slug: tenant.slug, tenantType: tenant.tenantType },
        });

        return reply.status(201).send({ tenant });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'TenantCreationFailed',
          message: err.message,
        });
      }
    }
  );

  // 1.4 Get Single Tenant Profile & Isolation Route
  app.get(
    '/api/platform/tenants/:id',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const tenant = await multiTenantRepo.getTenantById(id);
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, message: `Tenant '${id}' not found` });
      }

      const dbRoute = await multiTenantRepo.getDatabaseRoute(id);
      const members = await multiTenantRepo.listTenantMembers(id);
      const subscription = await multiTenantRepo.getSubscription(id);
      const usage = await multiTenantRepo.getUsage(id);

      return reply.status(200).send({
        tenant,
        databaseRoute: dbRoute,
        membersCount: members.length,
        subscription,
        usage,
      });
    }
  );

  // 1.5 Update Tenant Status (Activate / Suspend / Archive)
  app.patch(
    '/api/platform/tenants/:id/status',
    { preHandler: [resolveTenantContext, requirePlatformRole('platform_owner', 'platform_admin')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { status: TenantStatus; reason?: string };

      if (!body.status) {
        return reply.status(400).send({ statusCode: 400, message: 'status is required' });
      }

      try {
        const tenant = await multiTenantRepo.updateTenantStatus(
          id,
          body.status,
          body.reason,
          req.tenantContext!.userEmail
        );
        return reply.status(200).send({ tenant });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, message: err.message });
      }
    }
  );

  // 1.6 Dedicated Database Route Configuration
  app.put(
    '/api/platform/tenants/:id/database-route',
    { preHandler: [resolveTenantContext, requirePlatformRole('platform_owner', 'platform_admin')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        isolationMode: TenantIsolationMode;
        databaseUrlEncrypted?: string;
        databaseAnonKeyEncrypted?: string;
        databaseServiceKeyEncrypted?: string;
        schemaName?: string;
        maxConnections?: number;
      };

      try {
        const route = await multiTenantRepo.setDatabaseRoute({
          tenantId: id,
          isolationMode: body.isolationMode,
          databaseUrlEncrypted: body.databaseUrlEncrypted,
          databaseAnonKeyEncrypted: body.databaseAnonKeyEncrypted,
          databaseServiceKeyEncrypted: body.databaseServiceKeyEncrypted,
          schemaName: body.schemaName,
          maxConnections: body.maxConnections,
        });

        multiTenantRepo.logPlatformAction({
          actorEmail: req.tenantContext!.userEmail,
          action: 'database_route_updated',
          targetTenantId: id,
          entityType: 'database_route',
          entityId: route.id,
          details: { isolationMode: body.isolationMode },
        });

        return reply.status(200).send({ route });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, message: err.message });
      }
    }
  );

  // 1.7 Test Database Route Connectivity
  app.post(
    '/api/platform/tenants/:id/database-route/test',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await multiTenantRepo.testDatabaseRoute(id);
      return reply.status(200).send(result);
    }
  );

  // 1.8 Subscription Plans
  app.get(
    '/api/platform/subscriptions/plans',
    { preHandler: [resolveTenantContext] },
    async (_req, reply) => {
      const plans = await multiTenantRepo.listSubscriptionPlans();
      return reply.status(200).send({ plans });
    }
  );

  // 1.9 Audit Logs
  app.get(
    '/api/platform/audit-logs',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const query = req.query as { targetTenantId?: string; limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const logs = await multiTenantRepo.listPlatformAuditLogs(query.targetTenantId, limit);
      return reply.status(200).send({ logs });
    }
  );

  // 1.10 Platform Support Impersonation (Zero PII leak audit session)
  app.post(
    '/api/platform/support/impersonate',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const body = req.body as { targetTenantId: string; reason: string };
      if (!body.targetTenantId || !body.reason) {
        return reply.status(400).send({ statusCode: 400, message: 'targetTenantId and reason required' });
      }

      const session = await multiTenantRepo.startSupportAccessSession(
        req.tenantContext!.userId,
        req.tenantContext!.userEmail,
        body.targetTenantId,
        body.reason
      );
      return reply.status(200).send({ session });
    }
  );

  app.post(
    '/api/platform/support/impersonate/end',
    { preHandler: [resolveTenantContext, requirePlatformRole()] },
    async (req, reply) => {
      const body = req.body as { sessionId: string };
      if (!body.sessionId) {
        return reply.status(400).send({ statusCode: 400, message: 'sessionId required' });
      }

      const session = await multiTenantRepo.endSupportAccessSession(body.sessionId);
      return reply.status(200).send({ session });
    }
  );

  // ===========================================================================
  // 2. ONBOARDING & PROVISIONING WIZARD
  // ===========================================================================

  // 2.1 Self-Service SaaS Registration
  app.post('/api/onboarding/register', async (req, reply) => {
    const body = req.body as {
      businessName: string;
      slug: string;
      ownerEmail: string;
      industryProfile?: string;
      planId?: string;
    };

    if (!body.businessName || !body.slug || !body.ownerEmail) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'businessName, slug, and ownerEmail are required',
      });
    }

    try {
      const tenant = await multiTenantRepo.createTenant({
        name: body.businessName,
        slug: body.slug,
        tenantType: 'saas',
        industryProfile: body.industryProfile || 'general_retail',
        ownerEmail: body.ownerEmail,
        planId: body.planId || 'starter',
        isolationMode: 'shared',
      });

      return reply.status(201).send({
        tenant,
        nextStep: 2,
        message: 'Business registered successfully. Proceed with step 2 of onboarding wizard.',
      });
    } catch (err: any) {
      return reply.status(400).send({ statusCode: 400, message: err.message });
    }
  });

  // 2.2 Get Onboarding Progress
  app.get(
    '/api/onboarding/:tenantId/step',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      const tenant = await multiTenantRepo.getTenantById(tenantId);
      if (!tenant) {
        return reply.status(404).send({ statusCode: 404, message: 'Tenant not found' });
      }

      const validation = await multiTenantRepo.validateTenantReadiness(tenantId);
      return reply.status(200).send({
        tenantId: tenant.id,
        currentStep: tenant.onboardingStep,
        status: tenant.status,
        readyForActivation: validation.ready,
        missingRequirements: validation.missing,
      });
    }
  );

  // 2.3 Save Onboarding Step Data
  app.post(
    '/api/onboarding/:tenantId/step',
    { preHandler: [resolveTenantContext, requireTenantRole('business_owner', 'business_admin')] },
    async (req, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      const body = req.body as { step: number; data?: Record<string, unknown> };

      if (!body.step) {
        return reply.status(400).send({ statusCode: 400, message: 'step is required' });
      }

      try {
        const tenant = await multiTenantRepo.updateOnboardingStep(tenantId, body.step, body.data);
        return reply.status(200).send({ tenant, currentStep: tenant.onboardingStep });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, message: err.message });
      }
    }
  );

  // 2.4 Validate Tenant Readiness
  app.get(
    '/api/onboarding/:tenantId/validate',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      try {
        const validation = await multiTenantRepo.validateTenantReadiness(tenantId);
        return reply.status(200).send(validation);
      } catch (err: any) {
        return reply.status(404).send({ statusCode: 404, message: err.message });
      }
    }
  );

  // 2.5 Activate Tenant
  app.post(
    '/api/onboarding/:tenantId/activate',
    { preHandler: [resolveTenantContext, requireTenantRole('business_owner', 'business_admin')] },
    async (req, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      try {
        const tenant = await multiTenantRepo.activateTenant(
          tenantId,
          req.tenantContext!.userEmail
        );
        return reply.status(200).send({
          tenant,
          message: `Tenant '${tenant.name}' has been successfully activated and is now operational!`,
        });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'ActivationFailed',
          message: err.message,
        });
      }
    }
  );

  // ===========================================================================
  // 3. BUSINESS WORKSPACE APIS
  // ===========================================================================

  // 3.1 Current User Identity & Memberships
  app.get(
    '/api/workspace/me',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const ctx = req.tenantContext!;
      const userMemberships = await multiTenantRepo.listUserMemberships(ctx.userEmail);
      const accessibleTenants: any[] = [];

      for (const m of userMemberships) {
        const t = await multiTenantRepo.getTenantById(m.tenantId);
        if (t) {
          accessibleTenants.push({
            tenantId: t.id,
            name: t.name,
            slug: t.slug,
            tenantType: t.tenantType,
            status: t.status,
            role: m.role,
          });
        }
      }

      // If platform admin, they also have platform access
      return reply.status(200).send({
        user: {
          id: ctx.userId,
          email: ctx.userEmail,
          isPlatformAdmin: ctx.isPlatformAdmin,
          platformRole: ctx.platformRole,
        },
        currentWorkspace: {
          tenantId: ctx.tenantId,
          tenantSlug: ctx.tenantSlug,
          tenantName: ctx.tenantName,
          tenantType: ctx.tenantType,
          isolationMode: ctx.isolationMode,
          role: ctx.businessRole,
          permissions: ctx.permissions,
        },
        workspaces: accessibleTenants,
      });
    }
  );

  // 3.2 List Accessible Workspaces (for Workspace Switcher)
  app.get(
    '/api/workspace/tenants',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const ctx = req.tenantContext!;
      if (ctx.isPlatformAdmin) {
        // Platform admin can switch to all tenants
        const all = await multiTenantRepo.listTenants();
        return reply.status(200).send({ tenants: all });
      }

      const memberships = await multiTenantRepo.listUserMemberships(ctx.userEmail);
      const list = [];
      for (const m of memberships) {
        const t = await multiTenantRepo.getTenantById(m.tenantId);
        if (t) list.push({ ...t, userRole: m.role });
      }
      return reply.status(200).send({ tenants: list });
    }
  );

  // 3.2.1 Switch Tenant
  app.post(
    '/api/workspace/switch-tenant',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const body = req.body as { targetTenantId: string };
      const ctx = req.tenantContext!;
      if (!ctx.isPlatformAdmin) {
        const mem = await multiTenantRepo.getMembershipByUserId(body.targetTenantId, ctx.userId);
        if (!mem || !mem.isActive) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'TenantAccessDenied',
            message: `User '${ctx.userEmail}' has no active membership in tenant '${body.targetTenantId}'`,
          });
        }
      }
      const tenant = await multiTenantRepo.getTenantById(body.targetTenantId);
      if (!tenant) {
        return reply.status(404).send({ error: 'TenantNotFound' });
      }
      return reply.status(200).send({ success: true, tenant });
    }
  );

  // 3.3 Team Management (List Members)
  app.get(
    '/api/workspace/team',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const members = await multiTenantRepo.listTenantMembers(req.tenantContext!.tenantId);
      return reply.status(200).send({ members });
    }
  );

  // 3.4 Team Invitations (Invite Teammate)
  app.post(
    '/api/workspace/invitations',
    { preHandler: [resolveTenantContext, requireTenantRole('business_owner', 'business_admin')] },
    async (req, reply) => {
      const body = req.body as { email: string; role: BusinessRole };
      if (!body.email || !body.role) {
        return reply.status(400).send({ statusCode: 400, message: 'email and role required' });
      }

      // Check quota
      const quota = await multiTenantRepo.checkQuota(req.tenantContext!.tenantId, 'team_members');
      if (!quota.allowed) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'QuotaExceeded',
          message: `Team member limit reached (${quota.current}/${quota.limit}). Upgrade your subscription plan.`,
        });
      }

      const invitation = await multiTenantRepo.createInvitation({
        tenantId: req.tenantContext!.tenantId,
        email: body.email,
        role: body.role,
        invitedBy: req.tenantContext!.userEmail,
      });

      return reply.status(201).send({ invitation });
    }
  );

  // 3.5 Accept Team Invitation
  app.post('/api/workspace/invitations/accept', async (req, reply) => {
    const body = req.body as { token: string; userId?: string };
    if (!body.token) {
      return reply.status(400).send({ statusCode: 400, message: 'token required' });
    }

    try {
      const membership = await multiTenantRepo.acceptInvitation(
        body.token,
        body.userId || `usr_${Date.now()}`
      );
      return reply.status(200).send({ membership });
    } catch (err: any) {
      return reply.status(400).send({ statusCode: 400, message: err.message });
    }
  });

  // 3.6 Configuration Snapshot & Versions
  app.get(
    '/api/workspace/config',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const latest = await multiTenantRepo.getLatestConfiguration(req.tenantContext!.tenantId);
      const tenant = await multiTenantRepo.getTenantById(req.tenantContext!.tenantId);
      return reply.status(200).send({
        latestVersion: latest,
        tenantSettings: tenant?.settings,
      });
    }
  );

  app.post(
    '/api/workspace/config',
    { preHandler: [resolveTenantContext, requireTenantRole('business_owner', 'business_admin')] },
    async (req, reply) => {
      const body = req.body as {
        snapshot: Record<string, unknown>;
        changeSummary: string;
      };

      if (!body.snapshot || !body.changeSummary) {
        return reply.status(400).send({ statusCode: 400, message: 'snapshot and changeSummary required' });
      }

      const version = await multiTenantRepo.saveConfigurationVersion(
        req.tenantContext!.tenantId,
        body.snapshot,
        body.changeSummary,
        req.tenantContext!.userEmail
      );

      return reply.status(201).send({ version });
    }
  );

  app.get(
    '/api/workspace/config/versions',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const versions = await multiTenantRepo.listConfigurationVersions(req.tenantContext!.tenantId);
      return reply.status(200).send({ versions });
    }
  );

  app.post(
    '/api/workspace/config/rollback',
    { preHandler: [resolveTenantContext, requireTenantRole('business_owner', 'business_admin')] },
    async (req, reply) => {
      const body = req.body as { targetVersion: number };
      if (!body.targetVersion) {
        return reply.status(400).send({ statusCode: 400, message: 'targetVersion required' });
      }

      try {
        const version = await multiTenantRepo.rollbackConfiguration(
          req.tenantContext!.tenantId,
          body.targetVersion,
          req.tenantContext!.userEmail
        );
        return reply.status(200).send({
          version,
          message: `Configuration successfully rolled back to version ${body.targetVersion}`,
        });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, message: err.message });
      }
    }
  );

  // 3.7 Usage & Quotas Breakdown
  app.get(
    '/api/workspace/usage',
    { preHandler: [resolveTenantContext] },
    async (req, reply) => {
      const tenantId = req.tenantContext!.tenantId;
      const usage = await multiTenantRepo.getUsage(tenantId);
      const sub = await multiTenantRepo.getSubscription(tenantId);
      const aiTokenQuota = await multiTenantRepo.checkQuota(tenantId, 'ai_tokens');
      const convQuota = await multiTenantRepo.checkQuota(tenantId, 'conversations');
      const memberQuota = await multiTenantRepo.checkQuota(tenantId, 'team_members');

      return reply.status(200).send({
        billingMonth: usage.billingMonth,
        usage,
        plan: sub?.plan,
        quotas: {
          aiTokens: aiTokenQuota,
          conversations: convQuota,
          teamMembers: memberQuota,
        },
      });
    }
  );

  // 3.8 Industry Capability Profiles
  app.get('/api/workspace/industry-profiles', async (_req, reply) => {
    const profiles = await multiTenantRepo.listIndustryProfiles();
    return reply.status(200).send({ profiles });
  });
}
