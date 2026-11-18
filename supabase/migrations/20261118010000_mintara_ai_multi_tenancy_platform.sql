-- ==============================================================================
-- MINTARA AI HYBRID MULTI-TENANCY PLATFORM MIGRATION
-- Migration: 20261118010000_mintara_ai_multi_tenancy_platform.sql
-- ==============================================================================

-- 1. EXTEND TENANTS TABLE WITH MULTI-TENANT LIFECYCLE & ISOLATION
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(32) NOT NULL DEFAULT 'internal' CHECK (tenant_type IN ('internal', 'saas', 'platform')),
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'onboarding', 'configuration', 'validation', 'active', 'suspended', 'archived')),
  ADD COLUMN IF NOT EXISTS isolation_mode VARCHAR(32) NOT NULL DEFAULT 'shared' CHECK (isolation_mode IN ('shared', 'dedicated')),
  ADD COLUMN IF NOT EXISTS industry_profile VARCHAR(64) NOT NULL DEFAULT 'food_beverage',
  ADD COLUMN IF NOT EXISTS onboarding_step INT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id VARCHAR(64) NOT NULL DEFAULT 'enterprise';

-- Update Mintara Bites seed to internal active tenant
UPDATE public.tenants
SET
  tenant_type = 'internal',
  status = 'active',
  isolation_mode = 'shared',
  industry_profile = 'food_beverage',
  onboarding_step = 9,
  plan_id = 'enterprise'
WHERE id = '00000000-0000-0000-0000-000000000001' OR slug = 'mintara-bites';

-- Seed Platform Administrator Tenant
INSERT INTO public.tenants (id, name, slug, domain, tenant_type, status, isolation_mode, industry_profile, onboarding_step, settings)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Mintara AI Platform Control Plane',
  'mintara-platform',
  'admin.mintara.ai',
  'platform',
  'active',
  'shared',
  'custom',
  9,
  '{"isControlPlane": true, "timezone": "Asia/Kolkata"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- 2. PLATFORM USERS (Control Plane Operators & Global Identities)
CREATE TABLE IF NOT EXISTS public.platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32),
  role VARCHAR(64) NOT NULL DEFAULT 'platform_support' CHECK (role IN ('platform_owner', 'platform_admin', 'platform_support')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Platform Owner
INSERT INTO public.platform_users (id, email, full_name, role, is_active)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'owner@mintarabites.com',
  'Pathik (Platform Owner)',
  'platform_owner',
  true
)
ON CONFLICT (email) DO UPDATE
SET role = 'platform_owner', is_active = true;

-- 3. TENANT MEMBERSHIPS (Multi-Tenant RBAC: Users belonging to multiple tenants)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- references auth.users or platform_users
  user_email VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'business_viewer' CHECK (role IN (
    'business_owner',
    'business_admin',
    'business_operations',
    'business_support',
    'business_viewer'
  )),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_email)
);

-- Assign default owner membership to Mintara Bites
INSERT INTO public.tenant_memberships (tenant_id, user_id, user_email, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'owner@mintarabites.com',
  'business_owner',
  true
)
ON CONFLICT (tenant_id, user_email) DO NOTHING;

-- 4. TENANT INVITATIONS
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'business_support',
  token VARCHAR(128) NOT NULL UNIQUE,
  invited_by VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. DEDICATED DATABASE ROUTING (Hybrid Mode: Dedicated Supabase projects for selected tenants)
CREATE TABLE IF NOT EXISTS public.tenant_database_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  isolation_mode VARCHAR(32) NOT NULL DEFAULT 'shared' CHECK (isolation_mode IN ('shared', 'dedicated')),
  database_url_encrypted TEXT,
  database_anon_key_encrypted TEXT,
  database_service_key_encrypted TEXT,
  schema_name VARCHAR(128) NOT NULL DEFAULT 'public',
  max_connections INT NOT NULL DEFAULT 10,
  connection_timeout_ms INT NOT NULL DEFAULT 5000,
  health_status VARCHAR(32) NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'unreachable', 'maintenance')),
  last_health_check_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. VERSIONED TENANT CONFIGURATION
CREATE TABLE IF NOT EXISTS public.tenant_configuration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version INT NOT NULL,
  config_snapshot JSONB NOT NULL,
  change_summary TEXT NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, version)
);

-- 7. INDUSTRY CAPABILITY PROFILES
CREATE TABLE IF NOT EXISTS public.tenant_industry_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  recommended_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_policies JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed 8 Standard Industry Profiles
INSERT INTO public.tenant_industry_profiles (industry_key, name, description, recommended_modules, product_attributes)
VALUES
  ('food_beverage', 'Food & Beverage', 'Artisanal snacks, digestive treats, beverages with batch traceability & allergen tracking', '["manufacturing", "raw_materials", "batches", "qa_fssai", "suppliers", "inventory"]'::jsonb, '["ingredients", "allergens", "shelf_life", "refrigeration_required", "fssai_license"]'::jsonb),
  ('beauty_personal_care', 'Beauty & Personal Care', 'Cosmetics, skincare, organic care requiring skin compatibility & batch tracking', '["inventory", "suppliers", "reviews", "customer_intelligence"]'::jsonb, '["ingredients", "skin_type", "expiry_period_months", "cruelty_free", "dermatologically_tested"]'::jsonb),
  ('fashion_apparel', 'Fashion & Apparel', 'Clothing, footwear, lifestyle accessories with variant sizes and exchange flows', '["inventory", "campaigns", "customer_intelligence", "returns_exchanges"]'::jsonb, '["size", "color", "fit_type", "fabric_composition", "wash_care"]'::jsonb),
  ('health_wellness', 'Health & Wellness', 'Nutritional supplements, wellness elixirs, organic teas with dosage guidelines', '["inventory", "suppliers", "qa_compliance", "customer_intelligence"]'::jsonb, '["ingredients", "dosage", "certifications", "dietary_suitability"]'::jsonb),
  ('home_lifestyle', 'Home & Lifestyle', 'Home decor, candles, kitchenware with room placement & fragile shipping guards', '["inventory", "suppliers", "logistics_ndr", "campaigns"]'::jsonb, '["material", "dimensions", "fragile_handling", "care_instructions"]'::jsonb),
  ('electronics_accessories', 'Electronics & Accessories', 'Gadgets, audio, power accessories with warranty & tech compatibility', '["inventory", "warranty_support", "logistics_ndr", "campaigns"]'::jsonb, '["compatibility", "warranty_months", "power_specs", "serial_number_tracked"]'::jsonb),
  ('general_retail', 'General D2C Retail', 'Multi-category retail brands with catalog search and standard delivery', '["inventory", "campaigns", "customer_intelligence"]'::jsonb, '["sku", "weight_grams", "dimensions", "origin_country"]'::jsonb),
  ('custom', 'Custom Business', 'Flexible configuration template for bespoke consumer brands', '["inventory", "campaigns"]'::jsonb, '[]'::jsonb)
ON CONFLICT (industry_key) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 8. TENANT INTEGRATION CONNECTIONS (Per-Tenant Isolated Credentials)
CREATE TABLE IF NOT EXISTS public.tenant_integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type VARCHAR(64) NOT NULL CHECK (provider_type IN ('whatsapp', 'ecommerce', 'shiprocket', 'razorpay', 'telephony', 'email')),
  provider_name VARCHAR(64) NOT NULL, -- e.g. 'meta_cloud_api', 'supabase', 'shopify', 'exotel', 'resend'
  credentials_encrypted JSONB NOT NULL DEFAULT '{}'::jsonb,
  phone_number_identifier VARCHAR(64),
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  health_status VARCHAR(32) NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'error', 'unconfigured')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider_type)
);

-- 9. TENANT PROVISIONING & ONBOARDING JOBS
CREATE TABLE IF NOT EXISTS public.tenant_provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_name VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempt_count INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. SAAS SUBSCRIPTION PLANS & ENTITLEMENTS
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  monthly_price_inr INT NOT NULL DEFAULT 0,
  included_ai_tokens INT NOT NULL DEFAULT 1000000,
  included_conversations INT NOT NULL DEFAULT 500,
  max_team_members INT NOT NULL DEFAULT 5,
  dedicated_db_supported BOOLEAN NOT NULL DEFAULT false,
  allowed_modules JSONB NOT NULL DEFAULT '["support", "marketing", "inventory"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Standard SaaS Plans
INSERT INTO public.subscription_plans (id, name, description, monthly_price_inr, included_ai_tokens, included_conversations, max_team_members, dedicated_db_supported, allowed_modules)
VALUES
  ('starter', 'Starter D2C', 'Essential WhatsApp customer support & basic replenishment marketing for growing brands', 4999, 500000, 250, 2, false, '["support", "marketing", "inventory"]'::jsonb),
  ('growth', 'Growth D2C', 'Full marketing engines, RFM segmentation, supplier management & calling for scaling brands', 14999, 2500000, 1500, 10, false, '["support", "marketing", "inventory", "suppliers", "procurement", "calling"]'::jsonb),
  ('enterprise', 'Enterprise Brand Operating System', 'Full manufacturing, batch QA, dedicated DB routing, Level 3 approvals & custom AI agents', 49999, 10000000, 10000, 50, true, '["support", "marketing", "inventory", "manufacturing", "raw_materials", "batches", "qa_fssai", "suppliers", "procurement", "calling", "financials", "reports", "approvals"]'::jsonb)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 11. TENANT SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  plan_id VARCHAR(64) NOT NULL REFERENCES public.subscription_plans(id),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  trial_ends_at TIMESTAMPTZ,
  billing_provider VARCHAR(64) DEFAULT 'manual',
  external_subscription_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Mintara Bites enterprise subscription
INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'enterprise', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

-- 12. TENANT USAGE & METERING RECORDS
CREATE TABLE IF NOT EXISTS public.tenant_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_month VARCHAR(7) NOT NULL, -- e.g. '2026-11'
  total_ai_tokens_consumed INT NOT NULL DEFAULT 0,
  total_conversations INT NOT NULL DEFAULT 0,
  total_messages_sent INT NOT NULL DEFAULT 0,
  total_tools_executed INT NOT NULL DEFAULT 0,
  total_voice_minutes_used INT NOT NULL DEFAULT 0,
  total_storage_bytes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, billing_month)
);

-- 13. PLATFORM AUDIT LOGS & SUPPORT ACCESS AUDITS
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_email VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  entity_type VARCHAR(64),
  entity_id VARCHAR(128),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_access_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL,
  operator_email VARCHAR(255) NOT NULL,
  target_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,
  actions_performed JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- 14. ROW LEVEL SECURITY (RLS) POLICIES FOR HYBRID MULTI-TENANCY
-- Enable RLS across all enterprise tables
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tenants',
    'tenant_memberships',
    'tenant_invitations',
    'tenant_database_routes',
    'tenant_configuration_versions',
    'tenant_integration_connections',
    'tenant_subscriptions',
    'tenant_usage_records',
    'customer_segments',
    'segment_membership_history',
    'customer_consent',
    'suppression_lists',
    'campaign_definitions',
    'campaign_executions',
    'campaign_recipients',
    'personalized_discount_rules',
    'personalized_discount_logs',
    'suppliers',
    'supplier_materials',
    'supplier_quotations',
    'supplier_interactions',
    'supplier_calls',
    'knowledge_documents',
    'knowledge_document_versions',
    'knowledge_chunks',
    'business_memories',
    'continuous_learning_proposals',
    'raw_materials',
    'recipes',
    'recipe_ingredients',
    'production_orders',
    'production_batches',
    'quality_records',
    'finished_goods_inventory',
    'procurement_forecasts',
    'financial_snapshots',
    'unit_economics_configs',
    'approval_requests',
    'operational_alerts',
    'ecommerce_change_history',
    'sync_checkpoints'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    
    -- Drop existing policy if present
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;', t);
    
    -- Create strict tenant isolation policy
    -- Allows access if:
    -- 1. Table is tenants and id matches current_setting
    -- 2. Table has tenant_id column matching current_setting
    -- 3. current_setting('app.is_platform_admin', true) = 'true'
    IF t = 'tenants' THEN
      EXECUTE 'CREATE POLICY tenant_isolation_policy ON public.tenants
        FOR ALL USING (
          id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid
          OR current_setting(''app.is_platform_admin'', true) = ''true''
        );';
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON public.%I
        FOR ALL USING (
          tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid
          OR current_setting(''app.is_platform_admin'', true) = ''true''
        );', t);
    END IF;
  END LOOP;
END $$;
