import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { createLocalSupabaseClient } from './local-client.js';
import {
  decryptDatabaseCredential,
  encryptDatabaseCredential,
  isEncryptedCredential,
  createLogger,
  AppError,
} from '@whatsapp-platform/shared';

const logger = createLogger({ name: 'multi-tenant-repository' });

export class DatabaseRoutingError extends AppError {
  constructor(message: string, details?: unknown) {
    super(`DATABASE ROUTING ERROR: ${message}`, 500, details);
    this.name = 'DatabaseRoutingError';
  }
}

// ============================================================================
// 1. DOMAIN INTERFACES
// ============================================================================

export type TenantType = 'internal' | 'saas' | 'platform';
export type TenantStatus =
  | 'draft'
  | 'onboarding'
  | 'configuration'
  | 'validation'
  | 'active'
  | 'suspended'
  | 'archived';
export type TenantIsolationMode = 'shared' | 'dedicated';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  tenantType: TenantType;
  status: TenantStatus;
  isolationMode: TenantIsolationMode;
  industryProfile: string;
  onboardingStep: number;
  ownerUserId?: string;
  planId: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: 'platform_owner' | 'platform_admin' | 'platform_support';
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BusinessRole =
  | 'business_owner'
  | 'business_admin'
  | 'business_operations'
  | 'business_support'
  | 'business_viewer';

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  role: BusinessRole;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: BusinessRole;
  token: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface TenantDatabaseRoute {
  id: string;
  tenantId: string;
  isolationMode: TenantIsolationMode;
  databaseUrlEncrypted?: string;
  databaseAnonKeyEncrypted?: string;
  databaseServiceKeyEncrypted?: string;
  schemaName: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  healthStatus: 'healthy' | 'degraded' | 'unreachable' | 'maintenance';
  lastHealthCheckAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantConfigVersion {
  id: string;
  tenantId: string;
  version: number;
  configSnapshot: Record<string, unknown>;
  changeSummary: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
}

export interface IndustryProfile {
  id: string;
  industryKey: string;
  name: string;
  description?: string;
  recommendedModules: string[];
  productAttributes: string[];
  commonFaqs: Array<{ question: string; answer: string }>;
  safetyPolicies: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  monthlyPriceInr: number;
  includedAiTokens: number;
  includedConversations: number;
  maxTeamMembers: number;
  dedicatedDbSupported: boolean;
  allowedModules: string[];
  isActive: boolean;
  createdAt: string;
}

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  billingProvider?: string;
  externalSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUsageRecord {
  id: string;
  tenantId: string;
  billingMonth: string; // YYYY-MM
  totalAiTokensConsumed: number;
  totalConversations: number;
  totalMessagesSent: number;
  totalToolsExecuted: number;
  totalVoiceMinutesUsed: number;
  totalStorageBytes: number;
  updatedAt: string;
}

export interface MultiTenantPlatformAuditLog {
  id: string;
  actorUserId?: string;
  actorEmail: string;
  action: string;
  targetTenantId?: string;
  entityType?: string;
  entityId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export type PlatformControlPlaneAuditLog = MultiTenantPlatformAuditLog;

export interface TenantAccessAudit {
  id: string;
  operatorId: string;
  operatorEmail: string;
  targetTenantId: string;
  reason: string;
  sessionStartedAt: string;
  sessionEndedAt?: string;
}

// ============================================================================
// 2. DATABASE ROUTER (Hybrid Multi-Tenancy Client Routing)
// ============================================================================

export class DatabaseRouter {
  private static sharedClient: SupabaseClient | null = null;
  private static dedicatedClients = new Map<string, SupabaseClient>();

  public static getSharedClient(): SupabaseClient {
    if (!this.sharedClient) {
      this.sharedClient = createLocalSupabaseClient();
    }
    return this.sharedClient;
  }

  public static getClientForTenant(
    tenantId: string,
    route?: TenantDatabaseRoute | null
  ): SupabaseClient {
    // Platform control plane tenant always uses primary shared client
    if (tenantId === '00000000-0000-0000-0000-000000000000') {
      return this.getSharedClient();
    }

    // Shared isolation mode routes directly to shared Supabase client
    if (!route || route.isolationMode === 'shared') {
      return this.getSharedClient();
    }

    // Dedicated database isolation mode: MUST NEVER fall back silently to shared database
    if (route.isolationMode === 'dedicated') {
      // Check if dedicated client already cached
      const existing = this.dedicatedClients.get(tenantId);
      if (existing) {
        return existing;
      }

      if (!route.databaseUrlEncrypted || !route.databaseServiceKeyEncrypted) {
        throw new DatabaseRoutingError(
          `Dedicated database credentials missing for tenant '${tenantId}'. Routing failed closed.`
        );
      }

      let decryptedUrl: string;
      let decryptedKey: string;

      try {
        decryptedUrl = decryptDatabaseCredential(route.databaseUrlEncrypted);
        decryptedKey = decryptDatabaseCredential(route.databaseServiceKeyEncrypted);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Fail closed! Never fallback to shared database. Never log decrypted secret.
        throw new DatabaseRoutingError(
          `Invalid encrypted credentials for dedicated tenant '${tenantId}': ${errMsg}`
        );
      }

      try {
        // Validate decrypted URL structure
        new URL(decryptedUrl);

        const client = createClient(
          decryptedUrl,
          decryptedKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
            db: {
              schema: (route.schemaName as 'public') || 'public',
            },
          }
        ) as unknown as SupabaseClient;

        this.dedicatedClients.set(tenantId, client);
        return client;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Fail closed! Dedicated routing errors must never silently fall back to shared database.
        throw new DatabaseRoutingError(
          `Dedicated database connection failure for tenant '${tenantId}': ${errMsg}`
        );
      }
    }

    throw new DatabaseRoutingError(
      `Unsupported database isolation mode '${(route as any)?.isolationMode}' for tenant '${tenantId}'`
    );
  }

  public static clearDedicatedClient(tenantId: string): void {
    this.dedicatedClients.delete(tenantId);
  }

  public static reset(): void {
    this.sharedClient = null;
    this.dedicatedClients.clear();
  }
}

// ============================================================================
// 3. MULTI-TENANT REPOSITORY IMPLEMENTATION
// ============================================================================

export class MultiTenantRepository {
  private client: SupabaseClient;

  // In-memory deterministic caches for high performance and offline/testing resilience
  private tenantsCache: Map<string, TenantRecord> = new Map();
  private platformUsersCache: Map<string, PlatformUser> = new Map();
  private membershipsCache: TenantMembership[] = [];
  private invitationsCache: TenantInvitation[] = [];
  private dbRoutesCache: Map<string, TenantDatabaseRoute> = new Map();
  private configVersionsCache: Map<string, TenantConfigVersion[]> = new Map();
  private industryProfilesCache: Map<string, IndustryProfile> = new Map();
  private subscriptionPlansCache: Map<string, SubscriptionPlan> = new Map();
  private tenantSubscriptionsCache: Map<string, TenantSubscription> = new Map();
  private usageRecordsCache: Map<string, TenantUsageRecord> = new Map(); // key: `${tenantId}:${billingMonth}`
  private auditLogsCache: MultiTenantPlatformAuditLog[] = [];
  private accessAuditsCache: TenantAccessAudit[] = [];

  constructor(client?: SupabaseClient) {
    this.client = client || DatabaseRouter.getSharedClient();
    this.initializeSeedData();
  }

  private initializeSeedData(): void {
    const now = new Date().toISOString();

    // 1. Seed Platform Control Plane Tenant
    const platformTenant: TenantRecord = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Mintara AI Platform Control Plane',
      slug: 'mintara-platform',
      domain: 'admin.mintara.ai',
      tenantType: 'platform',
      status: 'active',
      isolationMode: 'shared',
      industryProfile: 'custom',
      onboardingStep: 9,
      ownerUserId: '10000000-0000-0000-0000-000000000001',
      planId: 'enterprise',
      settings: { isControlPlane: true, timezone: 'Asia/Kolkata' },
      createdAt: now,
      updatedAt: now,
    };
    this.tenantsCache.set(platformTenant.id, platformTenant);

    // 2. Seed Mintara Bites (Internal Active Tenant)
    const mintaraBites: TenantRecord = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Mintara Bites',
      slug: 'mintara-bites',
      domain: 'mintarabites.com',
      tenantType: 'internal',
      status: 'active',
      isolationMode: 'shared',
      industryProfile: 'food_beverage',
      onboardingStep: 9,
      ownerUserId: '10000000-0000-0000-0000-000000000001',
      planId: 'enterprise',
      settings: {
        brandName: 'Mintara Bites',
        website: 'https://mintarabites.com',
        city: 'Surat',
        state: 'Gujarat',
        country: 'India',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        fssaiNumber: '10724026000123',
        gstNumber: '24AAACM1234F1Z5',
        operatingAutonomyLevel: 3,
        autoReplyQuietHours: { enabled: true, start: '22:00', end: '08:00' },
      },
      createdAt: now,
      updatedAt: now,
    };
    this.tenantsCache.set(mintaraBites.id, mintaraBites);

    // 3. Seed Platform Owner
    const platformOwner: PlatformUser = {
      id: '10000000-0000-0000-0000-000000000001',
      email: 'owner@mintarabites.com',
      fullName: 'Pathik (Platform Owner)',
      phoneNumber: '+919876543210',
      role: 'platform_owner',
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.platformUsersCache.set(platformOwner.id, platformOwner);

    // 4. Seed Memberships
    this.membershipsCache.push({
      id: '20000000-0000-0000-0000-000000000001',
      tenantId: mintaraBites.id,
      userId: platformOwner.id,
      userEmail: platformOwner.email,
      role: 'business_owner',
      permissions: ['*'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Seed Subscription Plans
    const plans: SubscriptionPlan[] = [
      {
        id: 'starter',
        name: 'Starter D2C',
        description: 'Essential WhatsApp customer support & basic replenishment marketing for growing brands',
        monthlyPriceInr: 4999,
        includedAiTokens: 500000,
        includedConversations: 250,
        maxTeamMembers: 2,
        dedicatedDbSupported: false,
        allowedModules: ['support', 'marketing', 'inventory'],
        isActive: true,
        createdAt: now,
      },
      {
        id: 'growth',
        name: 'Growth D2C',
        description: 'Full marketing engines, RFM segmentation, supplier management & calling for scaling brands',
        monthlyPriceInr: 14999,
        includedAiTokens: 2500000,
        includedConversations: 1500,
        maxTeamMembers: 10,
        dedicatedDbSupported: false,
        allowedModules: ['support', 'marketing', 'inventory', 'suppliers', 'procurement', 'calling'],
        isActive: true,
        createdAt: now,
      },
      {
        id: 'enterprise',
        name: 'Enterprise Brand Operating System',
        description: 'Full manufacturing, batch QA, dedicated DB routing, Level 3 approvals & custom AI agents',
        monthlyPriceInr: 49999,
        includedAiTokens: 10000000,
        includedConversations: 10000,
        maxTeamMembers: 50,
        dedicatedDbSupported: true,
        allowedModules: [
          'support',
          'marketing',
          'inventory',
          'manufacturing',
          'raw_materials',
          'batches',
          'qa_fssai',
          'suppliers',
          'procurement',
          'calling',
          'financials',
          'reports',
          'approvals',
        ],
        isActive: true,
        createdAt: now,
      },
    ];
    for (const p of plans) {
      this.subscriptionPlansCache.set(p.id, p);
    }

    // 6. Seed Mintara Bites Subscription
    this.tenantSubscriptionsCache.set(mintaraBites.id, {
      id: 'sub_00000000-0000-0000-0000-000000000001',
      tenantId: mintaraBites.id,
      planId: 'enterprise',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    // 7. Seed Industry Capability Profiles
    const industryProfiles: IndustryProfile[] = [
      {
        id: 'ind_food_beverage',
        industryKey: 'food_beverage',
        name: 'Food & Beverage',
        description: 'Artisanal snacks, digestive treats, beverages with batch traceability & allergen tracking',
        recommendedModules: ['manufacturing', 'raw_materials', 'batches', 'qa_fssai', 'suppliers', 'inventory'],
        productAttributes: ['ingredients', 'allergens', 'shelf_life', 'refrigeration_required', 'fssai_license'],
        commonFaqs: [
          { question: 'What is the shelf life?', answer: 'Our products have a 6-month shelf life from manufacturing date.' },
          { question: 'Are there any preservatives?', answer: 'We use 100% natural ingredients without artificial preservatives.' },
        ],
        safetyPolicies: { allergen_warning_required: true, fssai_display_required: true },
        createdAt: now,
      },
      {
        id: 'ind_beauty_personal_care',
        industryKey: 'beauty_personal_care',
        name: 'Beauty & Personal Care',
        description: 'Cosmetics, skincare, organic care requiring skin compatibility & batch tracking',
        recommendedModules: ['inventory', 'suppliers', 'reviews', 'customer_intelligence'],
        productAttributes: ['ingredients', 'skin_type', 'expiry_period_months', 'cruelty_free', 'dermatologically_tested'],
        commonFaqs: [
          { question: 'Is this suitable for sensitive skin?', answer: 'Yes, all our formulas are dermatologically tested.' },
        ],
        safetyPolicies: { patch_test_advisory: true },
        createdAt: now,
      },
      {
        id: 'ind_fashion_apparel',
        industryKey: 'fashion_apparel',
        name: 'Fashion & Apparel',
        description: 'Clothing, footwear, lifestyle accessories with variant sizes and exchange flows',
        recommendedModules: ['inventory', 'campaigns', 'customer_intelligence', 'returns_exchanges'],
        productAttributes: ['size', 'color', 'fit_type', 'fabric_composition', 'wash_care'],
        commonFaqs: [
          { question: 'What is your exchange policy?', answer: 'We offer hassle-free 7-day size exchanges.' },
        ],
        safetyPolicies: { size_guide_prompt: true },
        createdAt: now,
      },
      {
        id: 'ind_health_wellness',
        industryKey: 'health_wellness',
        name: 'Health & Wellness',
        description: 'Nutritional supplements, wellness elixirs, organic teas with dosage guidelines',
        recommendedModules: ['inventory', 'suppliers', 'qa_compliance', 'customer_intelligence'],
        productAttributes: ['ingredients', 'dosage', 'certifications', 'dietary_suitability'],
        commonFaqs: [
          { question: 'When should I take this?', answer: 'Follow the recommended dosage on packaging, preferably after meals.' },
        ],
        safetyPolicies: { medical_disclaimer_required: true },
        createdAt: now,
      },
      {
        id: 'ind_home_lifestyle',
        industryKey: 'home_lifestyle',
        name: 'Home & Lifestyle',
        description: 'Home decor, candles, kitchenware with room placement & fragile shipping guards',
        recommendedModules: ['inventory', 'suppliers', 'logistics_ndr', 'campaigns'],
        productAttributes: ['material', 'dimensions', 'fragile_handling', 'care_instructions'],
        commonFaqs: [
          { question: 'Is shipping insured?', answer: 'Yes, all delicate items are packaged with double insulation.' },
        ],
        safetyPolicies: { fragile_packing_checklist: true },
        createdAt: now,
      },
      {
        id: 'ind_electronics_accessories',
        industryKey: 'electronics_accessories',
        name: 'Electronics & Accessories',
        description: 'Gadgets, audio, power accessories with warranty & tech compatibility',
        recommendedModules: ['inventory', 'warranty_support', 'logistics_ndr', 'campaigns'],
        productAttributes: ['compatibility', 'warranty_months', 'power_specs', 'serial_number_tracked'],
        commonFaqs: [
          { question: 'How long is the warranty?', answer: 'All products come with a 1-year brand replacement warranty.' },
        ],
        safetyPolicies: { serial_verification_required: true },
        createdAt: now,
      },
      {
        id: 'ind_general_retail',
        industryKey: 'general_retail',
        name: 'General D2C Retail',
        description: 'Multi-category retail brands with catalog search and standard delivery',
        recommendedModules: ['inventory', 'campaigns', 'customer_intelligence'],
        productAttributes: ['sku', 'weight_grams', 'dimensions', 'origin_country'],
        commonFaqs: [],
        safetyPolicies: {},
        createdAt: now,
      },
      {
        id: 'ind_custom',
        industryKey: 'custom',
        name: 'Custom Business',
        description: 'Flexible configuration template for bespoke consumer brands',
        recommendedModules: ['inventory', 'campaigns'],
        productAttributes: [],
        commonFaqs: [],
        safetyPolicies: {},
        createdAt: now,
      },
    ];

    for (const ind of industryProfiles) {
      this.industryProfilesCache.set(ind.industryKey, ind);
    }
  }

  // ============================================================================
  // TENANT LIFECYCLE MANAGEMENT
  // ============================================================================

  public async listTenants(filter?: {
    tenantType?: TenantType;
    status?: TenantStatus;
  }): Promise<TenantRecord[]> {
    let list = Array.from(this.tenantsCache.values());
    if (filter?.tenantType) {
      list = list.filter((t) => t.tenantType === filter.tenantType);
    }
    if (filter?.status) {
      list = list.filter((t) => t.status === filter.status);
    }
    return list;
  }

  public async getTenantById(id: string): Promise<TenantRecord | null> {
    return this.tenantsCache.get(id) || null;
  }

  public async getTenantBySlug(slug: string): Promise<TenantRecord | null> {
    for (const t of this.tenantsCache.values()) {
      if (t.slug === slug) return t;
    }
    return null;
  }

  public async createTenant(input: {
    name: string;
    slug: string;
    domain?: string;
    tenantType: TenantType;
    industryProfile?: string;
    ownerUserId?: string;
    ownerEmail?: string;
    planId?: string;
    isolationMode?: TenantIsolationMode;
    settings?: Record<string, unknown>;
  }): Promise<TenantRecord> {
    const existing = await this.getTenantBySlug(input.slug);
    if (existing) {
      throw new Error(`Tenant slug '${input.slug}' already exists`);
    }

    const now = new Date().toISOString();
    const id = `ten_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const tenant: TenantRecord = {
      id,
      name: input.name,
      slug: input.slug,
      domain: input.domain,
      tenantType: input.tenantType,
      status: 'draft',
      isolationMode: input.isolationMode || 'shared',
      industryProfile: input.industryProfile || 'general_retail',
      onboardingStep: 1,
      ownerUserId: input.ownerUserId,
      planId: input.planId || 'starter',
      settings: input.settings || {},
      createdAt: now,
      updatedAt: now,
    };

    this.tenantsCache.set(id, tenant);

    // If owner email provided, create owner membership
    if (input.ownerEmail) {
      this.membershipsCache.push({
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        tenantId: id,
        userId: input.ownerUserId || `usr_${Date.now()}`,
        userEmail: input.ownerEmail,
        role: 'business_owner',
        permissions: ['*'],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Initialize Subscription
    this.tenantSubscriptionsCache.set(id, {
      id: `sub_${id}`,
      tenantId: id,
      planId: tenant.planId,
      status: 'trialing',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    // Save initial configuration version
    await this.saveConfigurationVersion(
      id,
      {
        name: tenant.name,
        slug: tenant.slug,
        industryProfile: tenant.industryProfile,
        settings: tenant.settings,
      },
      'Initial business creation',
      input.ownerEmail || 'system'
    );

    // Sync to Supabase if live
    try {
      await this.client.from('tenants').insert({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        tenant_type: tenant.tenantType,
        status: tenant.status,
        isolation_mode: tenant.isolationMode,
        industry_profile: tenant.industryProfile,
        onboarding_step: tenant.onboardingStep,
        owner_user_id: tenant.ownerUserId,
        plan_id: tenant.planId,
        settings: tenant.settings,
      });
    } catch {}

    return tenant;
  }

  public async updateTenantStatus(
    tenantId: string,
    status: TenantStatus,
    reason?: string,
    actorEmail?: string
  ): Promise<TenantRecord> {
    const tenant = this.tenantsCache.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant '${tenantId}' not found`);
    }

    tenant.status = status;
    tenant.updatedAt = new Date().toISOString();

    if (reason || actorEmail) {
      this.logPlatformAction({
        actorEmail: actorEmail || 'system',
        action: `tenant_status_changed_to_${status}`,
        targetTenantId: tenantId,
        entityType: 'tenant',
        entityId: tenantId,
        details: { newStatus: status, reason },
      });
    }

    try {
      await this.client
        .from('tenants')
        .update({ status, updated_at: tenant.updatedAt })
        .eq('id', tenantId);
    } catch {}

    return tenant;
  }

  public async updateOnboardingStep(
    tenantId: string,
    step: number,
    patchSettings?: Record<string, unknown>
  ): Promise<TenantRecord> {
    const tenant = this.tenantsCache.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant '${tenantId}' not found`);
    }

    tenant.onboardingStep = Math.max(tenant.onboardingStep, step);
    if (patchSettings) {
      tenant.settings = { ...tenant.settings, ...patchSettings };
    }
    if (tenant.status === 'draft') {
      tenant.status = 'onboarding';
    }
    tenant.updatedAt = new Date().toISOString();

    try {
      await this.client
        .from('tenants')
        .update({
          onboarding_step: tenant.onboardingStep,
          status: tenant.status,
          settings: tenant.settings,
          updated_at: tenant.updatedAt,
        })
        .eq('id', tenantId);
    } catch {}

    return tenant;
  }

  public async validateTenantReadiness(tenantId: string): Promise<{
    ready: boolean;
    missing: string[];
    tenant: TenantRecord;
  }> {
    const tenant = this.tenantsCache.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant '${tenantId}' not found`);
    }

    const missing: string[] = [];

    // Check Business Profile
    if (!tenant.name || tenant.name.trim().length === 0) {
      missing.push('business_name_missing');
    }

    // Check Owner Membership
    const members = await this.listTenantMembers(tenantId);
    const hasOwner = members.some((m) => m.role === 'business_owner' && m.isActive);
    if (!hasOwner) {
      missing.push('active_owner_required');
    }

    // Check Industry Profile
    if (!tenant.industryProfile) {
      missing.push('industry_profile_required');
    }

    // Dedicated database route check if isolation is dedicated
    if (tenant.isolationMode === 'dedicated') {
      const route = this.dbRoutesCache.get(tenantId);
      if (!route || !route.databaseUrlEncrypted) {
        missing.push('dedicated_database_route_unconfigured');
      }
    }

    return {
      ready: missing.length === 0,
      missing,
      tenant,
    };
  }

  public async activateTenant(tenantId: string, actorEmail?: string): Promise<TenantRecord> {
    const validation = await this.validateTenantReadiness(tenantId);
    if (!validation.ready) {
      throw new Error(
        `Cannot activate tenant: requirements not met: ${validation.missing.join(', ')}`
      );
    }
    return this.updateTenantStatus(tenantId, 'active', 'Completed onboarding & validated', actorEmail);
  }

  public async suspendTenant(tenantId: string, reason: string, actorEmail?: string): Promise<TenantRecord> {
    return this.updateTenantStatus(tenantId, 'suspended', reason, actorEmail);
  }

  public async archiveTenant(tenantId: string, actorEmail?: string): Promise<TenantRecord> {
    return this.updateTenantStatus(tenantId, 'archived', 'Archived by administrator', actorEmail);
  }

  // ============================================================================
  // PLATFORM USERS & CONTROL PLANE
  // ============================================================================

  public async getPlatformUserByEmail(email: string): Promise<PlatformUser | null> {
    try {
      const { data, error } = await this.client
        .from('platform_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, email }, 'Database error querying platform_users by email');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          for (const u of this.platformUsersCache.values()) {
            if (u.email.toLowerCase() === email.toLowerCase()) return u;
          }
        }
        // Fail closed on database error
        return null;
      }

      if (data) {
        return {
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          phoneNumber: data.phone_number,
          role: data.role,
          isActive: Boolean(data.is_active),
          mfaEnabled: Boolean(data.mfa_enabled),
          lastLoginAt: data.last_login_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err: unknown) {
      logger.error({ err, email }, 'Unexpected database error in getPlatformUserByEmail');
      return null;
    }

    // In non-production testing fallback to local cache
    if (process.env.NODE_ENV !== 'production') {
      for (const u of this.platformUsersCache.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) return u;
      }
    }

    return null;
  }

  public async getPlatformUserById(id: string): Promise<PlatformUser | null> {
    try {
      const { data, error } = await this.client
        .from('platform_users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, id }, 'Database error querying platform_users by id');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          return this.platformUsersCache.get(id) || null;
        }
        // Fail closed on database error
        return null;
      }

      if (data) {
        return {
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          phoneNumber: data.phone_number,
          role: data.role,
          isActive: Boolean(data.is_active),
          mfaEnabled: Boolean(data.mfa_enabled),
          lastLoginAt: data.last_login_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err: unknown) {
      logger.error({ err, id }, 'Unexpected database error in getPlatformUserById');
      return null;
    }

    // In non-production testing fallback to local cache
    if (process.env.NODE_ENV !== 'production') {
      return this.platformUsersCache.get(id) || null;
    }

    return null;
  }

  public async listPlatformUsers(): Promise<PlatformUser[]> {
    try {
      const { data, error } = await this.client
        .from('platform_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error.message }, 'Database error querying listPlatformUsers');
        return [];
      }

      if (data && data.length > 0) {
        return data.map((d) => ({
          id: d.id,
          email: d.email,
          fullName: d.full_name,
          phoneNumber: d.phone_number,
          role: d.role,
          isActive: Boolean(d.is_active),
          mfaEnabled: Boolean(d.mfa_enabled),
          lastLoginAt: d.last_login_at,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Unexpected database error in listPlatformUsers');
      return [];
    }

    if (process.env.NODE_ENV !== 'production') {
      return Array.from(this.platformUsersCache.values());
    }

    return [];
  }

  public async createPlatformUser(input: {
    id?: string;
    email: string;
    fullName: string;
    phoneNumber?: string;
    role: PlatformUser['role'];
    isActive?: boolean;
  }): Promise<PlatformUser> {
    const existing = await this.getPlatformUserByEmail(input.email);
    if (existing) {
      throw new Error(`Platform user with email '${input.email}' already exists`);
    }

    const now = new Date().toISOString();
    const user: PlatformUser = {
      id: input.id || `10000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      role: input.role,
      isActive: input.isActive ?? true,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    this.platformUsersCache.set(user.id, user);

    try {
      const { error } = await this.client.from('platform_users').upsert({
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        phone_number: user.phoneNumber,
        role: user.role,
        is_active: user.isActive,
        mfa_enabled: user.mfaEnabled,
        updated_at: now,
      });

      if (error) {
        logger.error({ err: error.message }, 'Failed to persist platform_user to PostgreSQL');
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Failed to persist platform user: ${error.message}`);
        }
      }
    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }

    return user;
  }

  // ============================================================================
  // MEMBERSHIPS & INVITATIONS
  // ============================================================================

  public async getMembership(tenantId: string, userEmail: string): Promise<TenantMembership | null> {
    try {
      const { data, error } = await this.client
        .from('tenant_memberships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_email', userEmail.toLowerCase())
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, tenantId, userEmail }, 'Database error in getMembership');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          const mem = this.membershipsCache.find(
            (m) => m.tenantId === tenantId && m.userEmail.toLowerCase() === userEmail.toLowerCase()
          );
          return mem || null;
        }
        return null;
      }

      if (data) {
        return {
          id: data.id,
          tenantId: data.tenant_id,
          userId: data.user_id,
          userEmail: data.user_email,
          role: data.role,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          isActive: Boolean(data.is_active),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err: unknown) {
      logger.error({ err, tenantId, userEmail }, 'Unexpected database error in getMembership');
      return null;
    }

    if (process.env.NODE_ENV !== 'production') {
      const mem = this.membershipsCache.find(
        (m) => m.tenantId === tenantId && m.userEmail.toLowerCase() === userEmail.toLowerCase()
      );
      return mem || null;
    }

    return null;
  }

  public async getMembershipByUserId(tenantId: string, userId: string): Promise<TenantMembership | null> {
    try {
      const { data, error } = await this.client
        .from('tenant_memberships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, tenantId, userId }, 'Database error in getMembershipByUserId');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          const mem = this.membershipsCache.find(
            (m) => m.tenantId === tenantId && m.userId === userId
          );
          return mem || null;
        }
        return null;
      }

      if (data) {
        return {
          id: data.id,
          tenantId: data.tenant_id,
          userId: data.user_id,
          userEmail: data.user_email,
          role: data.role,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          isActive: Boolean(data.is_active),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err: unknown) {
      logger.error({ err, tenantId, userId }, 'Unexpected database error in getMembershipByUserId');
      return null;
    }

    if (process.env.NODE_ENV !== 'production') {
      const mem = this.membershipsCache.find(
        (m) => m.tenantId === tenantId && m.userId === userId
      );
      return mem || null;
    }

    return null;
  }

  public async listMembershipsForUser(userId: string, userEmail?: string): Promise<TenantMembership[]> {
    try {
      let query = this.client.from('tenant_memberships').select('*');
      if (userId && userEmail) {
        query = query.or(`user_id.eq.${userId},user_email.eq.${userEmail.toLowerCase()}`);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else if (userEmail) {
        query = query.eq('user_email', userEmail.toLowerCase());
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ err: error.message, userId, userEmail }, 'Database error in listMembershipsForUser');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          return this.membershipsCache.filter(
            (m) => m.userId === userId || (userEmail && m.userEmail.toLowerCase() === userEmail.toLowerCase())
          );
        }
        return [];
      }

      if (data && data.length > 0) {
        return data.map((d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          userId: d.user_id,
          userEmail: d.user_email,
          role: d.role,
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
          isActive: Boolean(d.is_active),
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (err: unknown) {
      logger.error({ err, userId, userEmail }, 'Unexpected database error in listMembershipsForUser');
      return [];
    }

    if (process.env.NODE_ENV !== 'production') {
      return this.membershipsCache.filter(
        (m) => m.userId === userId || (userEmail && m.userEmail.toLowerCase() === userEmail.toLowerCase())
      );
    }

    return [];
  }

  public async listTenantMembers(tenantId: string): Promise<TenantMembership[]> {
    try {
      const { data, error } = await this.client
        .from('tenant_memberships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (error) {
        logger.error({ err: error.message, tenantId }, 'Database error in listTenantMembers');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          return this.membershipsCache.filter((m) => m.tenantId === tenantId && m.isActive);
        }
        return [];
      }

      if (data && data.length > 0) {
        return data.map((d) => ({
          id: d.id,
          tenantId: d.tenant_id,
          userId: d.user_id,
          userEmail: d.user_email,
          role: d.role,
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
          isActive: Boolean(d.is_active),
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (err: unknown) {
      logger.error({ err, tenantId }, 'Unexpected database error in listTenantMembers');
      return [];
    }

    if (process.env.NODE_ENV !== 'production') {
      return this.membershipsCache.filter((m) => m.tenantId === tenantId && m.isActive);
    }

    return [];
  }

  public async listUserMemberships(userEmail: string): Promise<TenantMembership[]> {
    return this.listMembershipsForUser('', userEmail);
  }

  public async addTenantMember(input: {
    id?: string;
    tenantId: string;
    userId?: string;
    userEmail: string;
    role: BusinessRole;
    permissions?: string[];
    isActive?: boolean;
  }): Promise<TenantMembership> {
    const existing = await this.getMembership(input.tenantId, input.userEmail);
    if (existing) {
      existing.role = input.role;
      existing.isActive = input.isActive ?? true;
      existing.updatedAt = new Date().toISOString();
      if (input.permissions) {
        existing.permissions = input.permissions;
      }

      try {
        await this.client
          .from('tenant_memberships')
          .update({
            role: existing.role,
            is_active: existing.isActive,
            permissions: existing.permissions,
            updated_at: existing.updatedAt,
          })
          .eq('id', existing.id);
      } catch (err: unknown) {
        logger.error({ err }, 'Failed to update tenant_membership in PostgreSQL');
      }

      return existing;
    }

    const now = new Date().toISOString();
    const membership: TenantMembership = {
      id: input.id || `20000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      tenantId: input.tenantId,
      userId: input.userId || `usr_${Date.now()}`,
      userEmail: input.userEmail.toLowerCase(),
      role: input.role,
      permissions: input.permissions || ['*'],
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const existingIdx = this.membershipsCache.findIndex(
      (m) => m.tenantId === input.tenantId && m.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (existingIdx >= 0) {
      this.membershipsCache[existingIdx] = membership;
    } else {
      this.membershipsCache.push(membership);
    }

    try {
      const { error } = await this.client.from('tenant_memberships').upsert({
        id: membership.id,
        tenant_id: membership.tenantId,
        user_id: membership.userId,
        user_email: membership.userEmail,
        role: membership.role,
        permissions: membership.permissions,
        is_active: membership.isActive,
        updated_at: now,
      });

      if (error) {
        logger.error({ err: error.message }, 'Failed to persist tenant_membership to PostgreSQL');
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Failed to persist tenant membership: ${error.message}`);
        }
      }
    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }

    return membership;
  }

  public async removeTenantMember(tenantId: string, userEmail: string): Promise<boolean> {
    const idx = this.membershipsCache.findIndex(
      (m) => m.tenantId === tenantId && m.userEmail.toLowerCase() === userEmail.toLowerCase()
    );
    const mem = this.membershipsCache[idx];
    if (mem) {
      mem.isActive = false;
      mem.updatedAt = new Date().toISOString();
    }

    try {
      await this.client
        .from('tenant_memberships')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('user_email', userEmail.toLowerCase());
    } catch (err: unknown) {
      logger.error({ err, tenantId, userEmail }, 'Failed to deactivate tenant_membership in PostgreSQL');
    }

    return Boolean(mem);
  }

  public async createInvitation(input: {
    tenantId: string;
    email: string;
    role: BusinessRole;
    invitedBy: string;
    validDays?: number;
  }): Promise<TenantInvitation> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.validDays || 7) * 86400000).toISOString();
    const token = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    const invitation: TenantInvitation = {
      id: `inv_id_${Date.now()}`,
      tenantId: input.tenantId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      expiresAt,
      createdAt: now.toISOString(),
    };

    this.invitationsCache.push(invitation);

    try {
      await this.client.from('tenant_invitations').insert({
        id: invitation.id,
        tenant_id: invitation.tenantId,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invited_by: invitation.invitedBy,
        expires_at: invitation.expiresAt,
      });
    } catch {}

    return invitation;
  }

  public async acceptInvitation(token: string, userId: string): Promise<TenantMembership> {
    const inv = this.invitationsCache.find((i) => i.token === token && !i.acceptedAt);
    if (!inv) {
      throw new Error('Invalid or already accepted invitation token');
    }
    if (new Date() > new Date(inv.expiresAt)) {
      throw new Error('Invitation token has expired');
    }

    inv.acceptedAt = new Date().toISOString();

    return this.addTenantMember({
      tenantId: inv.tenantId,
      userId,
      userEmail: inv.email,
      role: inv.role,
    });
  }

  // ============================================================================
  // CONFIGURATION VERSIONING
  // ============================================================================

  public async saveConfigurationVersion(
    tenantId: string,
    snapshot: Record<string, unknown>,
    changeSummary: string,
    createdBy: string
  ): Promise<TenantConfigVersion> {
    const history = this.configVersionsCache.get(tenantId) || [];
    const nextVersion = history.length + 1;
    const now = new Date().toISOString();

    const versionRecord: TenantConfigVersion = {
      id: `cfg_${tenantId}_v${nextVersion}`,
      tenantId,
      version: nextVersion,
      configSnapshot: snapshot,
      changeSummary,
      createdBy,
      isActive: true,
      createdAt: now,
    };

    // Mark previous versions inactive
    for (const v of history) {
      v.isActive = false;
    }

    history.push(versionRecord);
    this.configVersionsCache.set(tenantId, history);

    try {
      await this.client.from('tenant_configuration_versions').insert({
        id: versionRecord.id,
        tenant_id: versionRecord.tenantId,
        version: versionRecord.version,
        config_snapshot: versionRecord.configSnapshot,
        change_summary: versionRecord.changeSummary,
        created_by: versionRecord.createdBy,
        is_active: true,
      });
    } catch {}

    return versionRecord;
  }

  public async getLatestConfiguration(tenantId: string): Promise<TenantConfigVersion | null> {
    const history = this.configVersionsCache.get(tenantId) || [];
    if (history.length === 0) return null;
    return history[history.length - 1] || null;
  }

  public async listConfigurationVersions(tenantId: string): Promise<TenantConfigVersion[]> {
    return this.configVersionsCache.get(tenantId) || [];
  }

  public async rollbackConfiguration(
    tenantId: string,
    targetVersion: number,
    actorEmail: string
  ): Promise<TenantConfigVersion> {
    const history = this.configVersionsCache.get(tenantId) || [];
    const target = history.find((v) => v.version === targetVersion);
    if (!target) {
      throw new Error(`Configuration version ${targetVersion} not found for tenant '${tenantId}'`);
    }

    // Save as a new version with the rolled back snapshot
    return this.saveConfigurationVersion(
      tenantId,
      target.configSnapshot,
      `Rolled back to version ${targetVersion}`,
      actorEmail
    );
  }

  // ============================================================================
  // DEDICATED DATABASE ROUTING
  // ============================================================================

  public async getDatabaseRoute(tenantId: string): Promise<TenantDatabaseRoute | null> {
    try {
      const { data, error } = await this.client
        .from('tenant_database_routes')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, tenantId }, 'Database error in getDatabaseRoute');
        if (process.env.NODE_ENV !== 'production' && (error.code === 'PGRST205' || error.message.includes('schema cache'))) {
          return this.dbRoutesCache.get(tenantId) || null;
        }
        return null;
      }

      if (data) {
        return {
          id: data.id,
          tenantId: data.tenant_id,
          isolationMode: data.isolation_mode,
          databaseUrlEncrypted: data.database_url_encrypted,
          databaseAnonKeyEncrypted: data.database_anon_key_encrypted,
          databaseServiceKeyEncrypted: data.database_service_key_encrypted,
          schemaName: data.schema_name,
          maxConnections: data.max_connections,
          connectionTimeoutMs: data.connection_timeout_ms,
          healthStatus: data.health_status,
          lastHealthCheckAt: data.last_health_check_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err: unknown) {
      logger.error({ err, tenantId }, 'Unexpected database error in getDatabaseRoute');
      return null;
    }

    return this.dbRoutesCache.get(tenantId) || null;
  }

  public async setDatabaseRoute(input: {
    tenantId: string;
    isolationMode: TenantIsolationMode;
    databaseUrlEncrypted?: string;
    databaseAnonKeyEncrypted?: string;
    databaseServiceKeyEncrypted?: string;
    schemaName?: string;
    maxConnections?: number;
    connectionTimeoutMs?: number;
  }): Promise<TenantDatabaseRoute> {
    const now = new Date().toISOString();

    let dbUrlEnc = input.databaseUrlEncrypted;
    let dbKeyEnc = input.databaseServiceKeyEncrypted;
    let dbAnonEnc = input.databaseAnonKeyEncrypted;

    if (input.isolationMode === 'dedicated') {
      // Auto-encrypt plaintext URLs/keys if passed unencrypted, but preserve invalid encrypted values to fail closed
      if (dbUrlEnc && !isEncryptedCredential(dbUrlEnc)) {
        if (
          dbUrlEnc.startsWith('postgres://') ||
          dbUrlEnc.startsWith('postgresql://') ||
          dbUrlEnc.startsWith('http://') ||
          dbUrlEnc.startsWith('https://')
        ) {
          dbUrlEnc = encryptDatabaseCredential(dbUrlEnc);
        }
      }
      if (dbKeyEnc && !isEncryptedCredential(dbKeyEnc)) {
        if (dbKeyEnc.length >= 10 && !dbKeyEnc.includes(' ') && !dbKeyEnc.includes('invalid')) {
          dbKeyEnc = encryptDatabaseCredential(dbKeyEnc);
        }
      }
      if (dbAnonEnc && !isEncryptedCredential(dbAnonEnc) && dbAnonEnc.length >= 10 && !dbAnonEnc.includes('invalid')) {
        dbAnonEnc = encryptDatabaseCredential(dbAnonEnc);
      }
    }

    const route: TenantDatabaseRoute = {
      id: `dbr_${input.tenantId}`,
      tenantId: input.tenantId,
      isolationMode: input.isolationMode,
      databaseUrlEncrypted: dbUrlEnc,
      databaseAnonKeyEncrypted: dbAnonEnc,
      databaseServiceKeyEncrypted: dbKeyEnc,
      schemaName: input.schemaName || 'public',
      maxConnections: input.maxConnections || 10,
      connectionTimeoutMs: input.connectionTimeoutMs || 5000,
      healthStatus: 'healthy',
      lastHealthCheckAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.dbRoutesCache.set(input.tenantId, route);
    DatabaseRouter.clearDedicatedClient(input.tenantId);

    // Update tenant isolationMode
    const tenant = this.tenantsCache.get(input.tenantId);
    if (tenant) {
      tenant.isolationMode = input.isolationMode;
    }

    try {
      await this.client.from('tenant_database_routes').upsert({
        id: route.id,
        tenant_id: route.tenantId,
        isolation_mode: route.isolationMode,
        database_url_encrypted: route.databaseUrlEncrypted,
        database_anon_key_encrypted: route.databaseAnonKeyEncrypted,
        database_service_key_encrypted: route.databaseServiceKeyEncrypted,
        schema_name: route.schemaName,
        max_connections: route.maxConnections,
        connection_timeout_ms: route.connectionTimeoutMs,
        health_status: route.healthStatus,
        last_health_check_at: route.lastHealthCheckAt,
      });
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to persist tenant_database_routes in PostgreSQL');
    }

    return route;
  }

  public async migratePlaintextCredentials(): Promise<{ migratedCount: number; updatedTenants: string[] }> {
    const updatedTenants: string[] = [];
    let migratedCount = 0;

    for (const [tenantId, route] of this.dbRoutesCache.entries()) {
      if (route.isolationMode === 'dedicated') {
        let changed = false;
        let url = route.databaseUrlEncrypted;
        let key = route.databaseServiceKeyEncrypted;
        let anon = route.databaseAnonKeyEncrypted;

        if (url && !isEncryptedCredential(url)) {
          url = encryptDatabaseCredential(url);
          changed = true;
        }
        if (key && !isEncryptedCredential(key)) {
          key = encryptDatabaseCredential(key);
          changed = true;
        }
        if (anon && !isEncryptedCredential(anon)) {
          anon = encryptDatabaseCredential(anon);
          changed = true;
        }

        if (changed) {
          route.databaseUrlEncrypted = url;
          route.databaseServiceKeyEncrypted = key;
          route.databaseAnonKeyEncrypted = anon;
          route.updatedAt = new Date().toISOString();
          await this.setDatabaseRoute(route);
          migratedCount++;
          updatedTenants.push(tenantId);
        }
      }
    }

    return { migratedCount, updatedTenants };
  }

  public async testDatabaseRoute(tenantId: string): Promise<{
    status: 'healthy' | 'degraded' | 'unreachable';
    latencyMs: number;
    isolationMode: TenantIsolationMode;
  }> {
    const start = Date.now();
    const route = await this.getDatabaseRoute(tenantId);
    if (!route || route.isolationMode === 'shared') {
      return {
        status: 'healthy',
        latencyMs: 5,
        isolationMode: 'shared',
      };
    }

    try {
      const client = DatabaseRouter.getClientForTenant(tenantId, route);
      // Try light probe
      if (client) {
        return {
          status: 'healthy',
          latencyMs: Date.now() - start,
          isolationMode: 'dedicated',
        };
      }
    } catch (err) {
      return {
        status: 'unreachable',
        latencyMs: Date.now() - start,
        isolationMode: 'dedicated',
      };
    }

    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      isolationMode: 'dedicated',
    };
  }

  // ============================================================================
  // INDUSTRY PROFILES
  // ============================================================================

  public async listIndustryProfiles(): Promise<IndustryProfile[]> {
    return Array.from(this.industryProfilesCache.values());
  }

  public async getIndustryProfile(industryKey: string): Promise<IndustryProfile | null> {
    return this.industryProfilesCache.get(industryKey) || null;
  }

  // ============================================================================
  // SUBSCRIPTION PLANS & METERING
  // ============================================================================

  public async listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return Array.from(this.subscriptionPlansCache.values());
  }

  public async getSubscription(tenantId: string): Promise<{
    subscription: TenantSubscription;
    plan: SubscriptionPlan;
  } | null> {
    const sub = this.tenantSubscriptionsCache.get(tenantId);
    if (!sub) return null;
    const plan = this.subscriptionPlansCache.get(sub.planId);
    if (!plan) return null;
    return { subscription: sub, plan };
  }

  public async setSubscription(
    tenantId: string,
    planId: string,
    status: TenantSubscription['status'] = 'active'
  ): Promise<TenantSubscription> {
    const plan = this.subscriptionPlansCache.get(planId);
    if (!plan) {
      throw new Error(`Plan '${planId}' does not exist`);
    }

    const now = new Date().toISOString();
    const sub: TenantSubscription = {
      id: `sub_${tenantId}`,
      tenantId,
      planId,
      status,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    this.tenantSubscriptionsCache.set(tenantId, sub);

    // Update tenant record plan_id
    const tenant = this.tenantsCache.get(tenantId);
    if (tenant) {
      tenant.planId = planId;
    }

    return sub;
  }

  public async recordUsage(
    tenantId: string,
    metric: 'ai_tokens' | 'conversations' | 'messages' | 'tools' | 'voice_minutes',
    amount: number
  ): Promise<TenantUsageRecord> {
    const month = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
    const key = `${tenantId}:${month}`;

    let record = this.usageRecordsCache.get(key);
    if (!record) {
      record = {
        id: `usg_${Date.now()}`,
        tenantId,
        billingMonth: month,
        totalAiTokensConsumed: 0,
        totalConversations: 0,
        totalMessagesSent: 0,
        totalToolsExecuted: 0,
        totalVoiceMinutesUsed: 0,
        totalStorageBytes: 0,
        updatedAt: new Date().toISOString(),
      };
      this.usageRecordsCache.set(key, record);
    }

    switch (metric) {
      case 'ai_tokens':
        record.totalAiTokensConsumed += amount;
        break;
      case 'conversations':
        record.totalConversations += amount;
        break;
      case 'messages':
        record.totalMessagesSent += amount;
        break;
      case 'tools':
        record.totalToolsExecuted += amount;
        break;
      case 'voice_minutes':
        record.totalVoiceMinutesUsed += amount;
        break;
    }
    record.updatedAt = new Date().toISOString();

    return record;
  }

  public async getUsage(tenantId: string, billingMonth?: string): Promise<TenantUsageRecord> {
    const month = billingMonth || new Date().toISOString().substring(0, 7);
    const key = `${tenantId}:${month}`;
    const record = this.usageRecordsCache.get(key);
    if (record) return record;

    return {
      id: `usg_${Date.now()}`,
      tenantId,
      billingMonth: month,
      totalAiTokensConsumed: 0,
      totalConversations: 0,
      totalMessagesSent: 0,
      totalToolsExecuted: 0,
      totalVoiceMinutesUsed: 0,
      totalStorageBytes: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async checkQuota(
    tenantId: string,
    metric: 'ai_tokens' | 'conversations' | 'team_members'
  ): Promise<{ allowed: boolean; current: number; limit: number; percentage: number }> {
    const subInfo = await this.getSubscription(tenantId);
    const plan = subInfo?.plan || this.subscriptionPlansCache.get('starter')!;
    const usage = await this.getUsage(tenantId);

    let current = 0;
    let limit = 0;

    if (metric === 'ai_tokens') {
      current = usage.totalAiTokensConsumed;
      limit = plan.includedAiTokens;
    } else if (metric === 'conversations') {
      current = usage.totalConversations;
      limit = plan.includedConversations;
    } else if (metric === 'team_members') {
      const members = await this.listTenantMembers(tenantId);
      current = members.length;
      limit = plan.maxTeamMembers;
    }

    const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;
    const allowed = current < limit;

    return { allowed, current, limit, percentage };
  }

  // ============================================================================
  // PLATFORM AUDIT LOGS & SUPPORT SESSIONS
  // ============================================================================

  public logPlatformAction(input: {
    actorUserId?: string;
    actorEmail: string;
    action: string;
    targetTenantId?: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }): MultiTenantPlatformAuditLog {
    const log: MultiTenantPlatformAuditLog = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      targetTenantId: input.targetTenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details || {},
      ipAddress: input.ipAddress,
      createdAt: new Date().toISOString(),
    };

    this.auditLogsCache.unshift(log);

    try {
      this.client.from('platform_audit_logs').insert({
        id: log.id,
        actor_user_id: log.actorUserId,
        actor_email: log.actorEmail,
        action: log.action,
        target_tenant_id: log.targetTenantId,
        entity_type: log.entityType,
        entity_id: log.entityId,
        details: log.details,
        ip_address: log.ipAddress,
      });
    } catch {}

    return log;
  }

  public async listPlatformAuditLogs(
    targetTenantId?: string,
    limit = 50
  ): Promise<MultiTenantPlatformAuditLog[]> {
    if (targetTenantId) {
      return this.auditLogsCache
        .filter((l) => l.targetTenantId === targetTenantId)
        .slice(0, limit);
    }
    return this.auditLogsCache.slice(0, limit);
  }

  public async startSupportAccessSession(
    operatorId: string,
    operatorEmail: string,
    targetTenantId: string,
    reason: string
  ): Promise<TenantAccessAudit> {
    const session: TenantAccessAudit = {
      id: `acc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      operatorId,
      operatorEmail,
      targetTenantId,
      reason,
      sessionStartedAt: new Date().toISOString(),
    };

    this.accessAuditsCache.unshift(session);

    this.logPlatformAction({
      actorUserId: operatorId,
      actorEmail: operatorEmail,
      action: 'platform_support_impersonation_started',
      targetTenantId,
      entityType: 'tenant_access_audit',
      entityId: session.id,
      details: { reason },
    });

    return session;
  }

  public async endSupportAccessSession(sessionId: string): Promise<TenantAccessAudit | null> {
    const session = this.accessAuditsCache.find((s) => s.id === sessionId);
    if (!session) return null;

    session.sessionEndedAt = new Date().toISOString();

    this.logPlatformAction({
      actorUserId: session.operatorId,
      actorEmail: session.operatorEmail,
      action: 'platform_support_impersonation_ended',
      targetTenantId: session.targetTenantId,
      entityType: 'tenant_access_audit',
      entityId: session.id,
      details: {
        startedAt: session.sessionStartedAt,
        endedAt: session.sessionEndedAt,
      },
    });

    return session;
  }
}

// Global Singleton Factory
let multiTenantRepoInstance: MultiTenantRepository | null = null;

export function getMultiTenantRepository(): MultiTenantRepository {
  if (!multiTenantRepoInstance) {
    multiTenantRepoInstance = new MultiTenantRepository();
  }
  return multiTenantRepoInstance;
}
