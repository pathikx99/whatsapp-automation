-- ==============================================================================
-- MINTARA AI PLATFORM - CONSOLIDATED DATABASE SCHEMA (schema.sql)
-- Version: 6.0 (Complete Unified Platform Architecture)
-- ==============================================================================
-- This schema belongs strictly to the Mintara AI WhatsApp Platform.
-- All external e-commerce data (customers, products, variants, orders, cart_items)
-- is queried directly from the E-Commerce Supabase instance (ECOMMERCE_SUPABASE_URL).
--
-- Platform Core Tables (19 Tables):
--  1. support_conversations  - Active/escalated customer session state & mute flags
--  2. support_messages       - Multi-turn conversation chat history for AI context
--  3. support_tickets        - Human escalation tracking, review & resolution
--  4. marketing_dispatches   - Anti-fatigue marketing broadcast records & opt-outs
--  5. messaging_receipts     - WhatsApp Meta status receipts (sent/delivered/read)
--  6. worker_jobs            - Asynchronous background task queue with concurrency locks
--  7. ad_referrals           - Click-to-WhatsApp (CTWA) ad attribution & ROAS tracking
--  8. ndr_instructions       - Logistics Non-Delivery Report customer instructions
--  9. company_settings       - Dynamic business profile, markdown & knowledge base
-- 10. processed_webhooks    - Inbound webhook idempotency ledger
-- 11. reviews               - WhatsApp CSAT feedback & synced multi-platform reviews
-- 12. promo_codes           - Dynamic single-use promotional & cart recovery codes
-- 13. abandoned_cart_logs   - Abandoned cart campaign tracking & recovery tokens
-- 14. ai_activity_logs      - Granular event tracking (support, enquiries, tasks)
-- 15. ai_task_executions    - AI worker task lifecycle & duration tracking
-- 16. ai_daily_reports      - 22:00 IST intelligence reports & metrics
-- 17. ai_report_deliveries  - WhatsApp & Dashboard report delivery ledger
-- 18. ai_report_settings    - Daily reporting schedule (22:00 IST), channels & recipients
-- 19. ai_audit_logs         - Immutable audit trail for sensitive administrative operations
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. WHATSAPP AI SUPPORT & CONVERSATION MEMORY
-- ------------------------------------------------------------------------------

-- 2.1 Support Conversations (State, Mute Policy & Escalation Status)
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL UNIQUE,
  customer_name VARCHAR(255) DEFAULT 'Customer',
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'closed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Support Messages (Multi-Turn Chat History for AI Context)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('customer', 'assistant', 'human_agent', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 Support Escalation Tickets (Human Agent Takeover)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE SET NULL,
  phone_number VARCHAR(32) NOT NULL,
  customer_name VARCHAR(255),
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. MARKETING, MESSAGING GATEWAY & BACKGROUND QUEUE
-- ------------------------------------------------------------------------------

-- 3.1 Marketing Dispatches (Anti-Fatigue Message Tracking & Opt-Outs)
CREATE TABLE IF NOT EXISTS public.marketing_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  segment_type VARCHAR(64) NOT NULL,
  message_preview TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Messaging Receipts (Meta Delivery & Read Status Receipts)
CREATE TABLE IF NOT EXISTS public.messaging_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid VARCHAR(255) NOT NULL UNIQUE,
  recipient VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 Worker Queue Jobs (Asynchronous Background Tasks with Concurrency Locking)
CREATE TABLE IF NOT EXISTS public.worker_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying', 'dead_letter')),
  retries INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(128),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. CONVERSIONS, ATTRIBUTION & LOGISTICS
-- ------------------------------------------------------------------------------

-- 4.1 Ad Referrals & Click-To-WhatsApp (CTWA) Attribution Tracking
CREATE TABLE IF NOT EXISTS public.ad_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  source_id VARCHAR(128),
  ad_id VARCHAR(128),
  headline TEXT,
  body TEXT,
  source_type VARCHAR(64) DEFAULT 'ad',
  source_url TEXT,
  media_type VARCHAR(32),
  image_url TEXT,
  video_url TEXT,
  ctwa_clid TEXT,
  customer_id UUID,
  raw_referral JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Logistics NDR (Non-Delivery Report) Instructions
CREATE TABLE IF NOT EXISTS public.ndr_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  order_number VARCHAR(64),
  instructions TEXT NOT NULL,
  courier VARCHAR(64) DEFAULT 'courier',
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 Dynamic Business Settings & Knowledge
CREATE TABLE IF NOT EXISTS public.company_settings (
  id VARCHAR(64) PRIMARY KEY DEFAULT 'current',
  profile JSONB NOT NULL,
  custom_markdown TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(64) DEFAULT 'system'
);

-- 4.4 Webhook Idempotency Ledger
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5 Customer CSAT & Synced Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL DEFAULT 'general',
  customer_id UUID,
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6 Dynamic Promo Codes (Incentives / Cart Recovery)
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type = ANY (ARRAY['flat'::text, 'percent'::text, 'free_delivery'::text])),
  value NUMERIC NOT NULL,
  min_subtotal NUMERIC,
  max_discount NUMERIC,
  expires_at TIMESTAMPTZ,
  usage_limit INTEGER,
  used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.7 Abandoned Cart Recovery Logs
CREATE TABLE IF NOT EXISTS public.abandoned_cart_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  customer_id UUID,
  order_id UUID,
  customer_name TEXT,
  phone TEXT,
  cart_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  recovery_token TEXT UNIQUE NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  discount_code TEXT,
  last_email_sent_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. REPORTING, ACTIVITY & AUDIT FOUNDATION
-- ------------------------------------------------------------------------------

-- 5.1 AI Activity Logs (Granular Event Tracking)
CREATE TABLE IF NOT EXISTS public.ai_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  phone_number VARCHAR(32),
  customer_name VARCHAR(255),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending', 'escalated', 'blocked')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model VARCHAR(64),
  tokens_used INT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.2 AI Task Executions (Worker Task Lifecycle Tracking)
CREATE TABLE IF NOT EXISTS public.ai_task_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'retrying')),
  target_id VARCHAR(128),
  input_payload JSONB DEFAULT '{}'::jsonb,
  output_payload JSONB DEFAULT '{}'::jsonb,
  error_details TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

-- 5.3 AI Daily Reports (Scheduled for 22:00 IST)
CREATE TABLE IF NOT EXISTS public.ai_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  unresolved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'compiled' CHECK (status IN ('draft', 'compiled', 'delivered', 'failed')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.4 AI Report Deliveries (WhatsApp & Dashboard Delivery Tracking)
CREATE TABLE IF NOT EXISTS public.ai_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.ai_daily_reports(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL CHECK (channel IN ('whatsapp', 'dashboard', 'email')),
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  meta_wamid VARCHAR(255),
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_report_delivery UNIQUE (report_id, channel, recipient)
);

-- 5.5 AI Report Settings (Timezone Asia/Kolkata, Schedule & Delivery Channels)
CREATE TABLE IF NOT EXISTS public.ai_report_settings (
  id VARCHAR(64) PRIMARY KEY DEFAULT 'current',
  scheduled_time VARCHAR(8) NOT NULL DEFAULT '22:00',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  detail_level VARCHAR(32) NOT NULL DEFAULT 'detailed' CHECK (detail_level IN ('summary', 'standard', 'detailed')),
  immediate_alerts BOOLEAN NOT NULL DEFAULT true,
  whatsapp_delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  dashboard_delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  recipient_phone_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(64) DEFAULT 'system'
);

INSERT INTO public.ai_report_settings (
  id, scheduled_time, timezone, detail_level, immediate_alerts, whatsapp_delivery_enabled, dashboard_delivery_enabled, recipient_phone_numbers
) VALUES (
  'current', '22:00', 'Asia/Kolkata', 'detailed', true, true, true, '[]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 5.6 AI Audit Logs (Immutable Sensitive Operation Trail)
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(64) NOT NULL,
  actor_type VARCHAR(32) NOT NULL CHECK (actor_type IN ('system', 'ai', 'admin', 'customer')),
  actor_id VARCHAR(128),
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'rejected', 'authorized')),
  changes JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. PERFORMANCE & QUERY OPTIMIZATION INDEXES
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_support_conversations_phone ON public.support_conversations (phone_number);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON public.support_conversations (status);
CREATE INDEX IF NOT EXISTS idx_support_messages_phone ON public.support_messages (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON public.support_messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_phone ON public.support_tickets (phone_number);
CREATE INDEX IF NOT EXISTS idx_marketing_dispatches_phone_time ON public.marketing_dispatches (phone_number, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_receipts_wamid ON public.messaging_receipts (wamid);
CREATE INDEX IF NOT EXISTS idx_messaging_receipts_recipient ON public.messaging_receipts (recipient);
CREATE INDEX IF NOT EXISTS idx_worker_jobs_status_sched ON public.worker_jobs (status, scheduled_for ASC);
CREATE INDEX IF NOT EXISTS idx_worker_jobs_claim ON public.worker_jobs (status, scheduled_for, locked_at);
CREATE INDEX IF NOT EXISTS idx_ad_referrals_phone ON public.ad_referrals (phone_number);
CREATE INDEX IF NOT EXISTS idx_ad_referrals_ad_id ON public.ad_referrals (ad_id);
CREATE INDEX IF NOT EXISTS idx_ndr_instructions_phone ON public.ndr_instructions (phone_number);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_lookup ON public.abandoned_cart_logs (email, status, created_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_token ON public.abandoned_cart_logs (recovery_token);
CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_event_time ON public.ai_activity_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_phone ON public.ai_activity_logs (phone_number);
CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_created ON public.ai_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_task_executions_task_time ON public.ai_task_executions (task_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_task_executions_status ON public.ai_task_executions (status);
CREATE INDEX IF NOT EXISTS idx_ai_daily_reports_date ON public.ai_daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_daily_reports_status ON public.ai_daily_reports (status);
CREATE INDEX IF NOT EXISTS idx_ai_report_deliveries_report ON public.ai_report_deliveries (report_id);
CREATE INDEX IF NOT EXISTS idx_ai_report_deliveries_channel_recipient ON public.ai_report_deliveries (channel, recipient);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_action_time ON public.ai_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_actor ON public.ai_audit_logs (actor_type);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_resource ON public.ai_audit_logs (resource_type, resource_id);

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) & SERVICE ROLE PRIVILEGES
-- ------------------------------------------------------------------------------

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ndr_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access across Platform Tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_conversations' AND policyname = 'service_role_manage_support_conversations') THEN
      CREATE POLICY service_role_manage_support_conversations ON public.support_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_messages' AND policyname = 'service_role_manage_support_messages') THEN
      CREATE POLICY service_role_manage_support_messages ON public.support_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'service_role_manage_support_tickets') THEN
      CREATE POLICY service_role_manage_support_tickets ON public.support_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketing_dispatches' AND policyname = 'service_role_manage_marketing_dispatches') THEN
      CREATE POLICY service_role_manage_marketing_dispatches ON public.marketing_dispatches FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messaging_receipts' AND policyname = 'service_role_manage_messaging_receipts') THEN
      CREATE POLICY service_role_manage_messaging_receipts ON public.messaging_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_jobs' AND policyname = 'service_role_manage_worker_jobs') THEN
      CREATE POLICY service_role_manage_worker_jobs ON public.worker_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'service_role_manage_company_settings') THEN
      CREATE POLICY service_role_manage_company_settings ON public.company_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ad_referrals' AND policyname = 'service_role_manage_ad_referrals') THEN
      CREATE POLICY service_role_manage_ad_referrals ON public.ad_referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ndr_instructions' AND policyname = 'service_role_manage_ndr_instructions') THEN
      CREATE POLICY service_role_manage_ndr_instructions ON public.ndr_instructions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'processed_webhooks' AND policyname = 'service_role_manage_processed_webhooks') THEN
      CREATE POLICY service_role_manage_processed_webhooks ON public.processed_webhooks FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'service_role_manage_reviews') THEN
      CREATE POLICY service_role_manage_reviews ON public.reviews FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promo_codes' AND policyname = 'service_role_manage_promo_codes') THEN
      CREATE POLICY service_role_manage_promo_codes ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'abandoned_cart_logs' AND policyname = 'service_role_manage_abandoned_cart_logs') THEN
      CREATE POLICY service_role_manage_abandoned_cart_logs ON public.abandoned_cart_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_activity_logs' AND policyname = 'service_role_manage_ai_activity_logs') THEN
      CREATE POLICY service_role_manage_ai_activity_logs ON public.ai_activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_task_executions' AND policyname = 'service_role_manage_ai_task_executions') THEN
      CREATE POLICY service_role_manage_ai_task_executions ON public.ai_task_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_daily_reports' AND policyname = 'service_role_manage_ai_daily_reports') THEN
      CREATE POLICY service_role_manage_ai_daily_reports ON public.ai_daily_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_report_deliveries' AND policyname = 'service_role_manage_ai_report_deliveries') THEN
      CREATE POLICY service_role_manage_ai_report_deliveries ON public.ai_report_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_report_settings' AND policyname = 'service_role_manage_ai_report_settings') THEN
      CREATE POLICY service_role_manage_ai_report_settings ON public.ai_report_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_audit_logs' AND policyname = 'service_role_manage_ai_audit_logs') THEN
      CREATE POLICY service_role_manage_ai_audit_logs ON public.ai_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;
  END IF;
END $$;

-- Public Read Policies (for reviews)
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Public reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);

-- ------------------------------------------------------------------------------
-- 8. RELOAD POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
-- ==============================================================================
-- MINTARA AI ENTERPRISE BUSINESS OPERATING SYSTEM MIGRATION
-- Migration: 20261118000000_mintara_ai_enterprise_os.sql
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TENANTS & ACCESS CONTROL (Multi-Tenant Foundation)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  domain VARCHAR(255),
  tenant_type VARCHAR(32) NOT NULL DEFAULT 'internal' CHECK (tenant_type IN ('internal', 'saas', 'platform')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'onboarding', 'configuration', 'validation', 'active', 'suspended', 'archived')),
  isolation_mode VARCHAR(32) NOT NULL DEFAULT 'shared' CHECK (isolation_mode IN ('shared', 'dedicated')),
  industry_profile VARCHAR(64) NOT NULL DEFAULT 'food_beverage',
  onboarding_step INT NOT NULL DEFAULT 9,
  owner_user_id UUID,
  plan_id VARCHAR(64) NOT NULL DEFAULT 'enterprise',
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.1 PLATFORM USERS (Control Plane Operators & Global Identities)
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

-- 2.2 TENANT MEMBERSHIPS (Multi-Tenant RBAC)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
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

-- 2.3 TENANT INVITATIONS
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

-- 2.4 DEDICATED DATABASE ROUTING
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

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'support_agent', 'viewer')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  password_hash VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Seed default Mintara Bites tenant
INSERT INTO public.tenants (id, name, slug, domain, is_active, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Mintara Bites',
  'mintara-bites',
  'mintarabites.com',
  true,
  '{"brand": "Mintara Bites", "timezone": "Asia/Kolkata", "currency": "INR"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- 3. CUSTOMER INTELLIGENCE & DYNAMIC SEGMENTATION
CREATE TABLE IF NOT EXISTS public.customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  member_count INT NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS public.segment_membership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES public.customer_segments(id) ON DELETE CASCADE,
  customer_id VARCHAR(128) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL CHECK (action IN ('added', 'removed')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CUSTOMER CONSENT & SUPPRESSION LISTS
CREATE TABLE IF NOT EXISTS public.customer_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  email VARCHAR(255),
  channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'sms', 'voice')),
  consent_status VARCHAR(32) NOT NULL DEFAULT 'opted_in' CHECK (consent_status IN ('opted_in', 'opted_out')),
  opt_in_source VARCHAR(128) DEFAULT 'website_checkout',
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, phone_number, channel)
);

CREATE TABLE IF NOT EXISTS public.suppression_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  email VARCHAR(255),
  reason VARCHAR(64) NOT NULL CHECK (reason IN ('complaint_unresolved', 'opted_out', 'manual_block', 'high_risk', 'quiet_hours')),
  active_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, phone_number, reason)
);

-- 5. MARKETING AUTOMATIONS & CAMPAIGN ENGINE (10 Workflows)
CREATE TABLE IF NOT EXISTS public.campaign_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(64) NOT NULL CHECK (campaign_type IN (
    'abandoned_cart',
    'abandoned_checkout',
    'win_back',
    'festival',
    'product_launch',
    'cross_sell',
    'referral',
    'loyalty_rewards',
    'review_collection',
    'birthday_anniversary'
  )),
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  timing_config JSONB NOT NULL DEFAULT '{"delayMinutes": 60, "quietHours": {"start": "21:00", "end": "09:00"}}'::jsonb,
  audience_segment_id UUID REFERENCES public.customer_segments(id) ON DELETE SET NULL,
  template_name VARCHAR(255),
  message_template TEXT NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  approval_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaign_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaign_definitions(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'completed', 'paused', 'cancelled', 'failed')),
  total_target INT NOT NULL DEFAULT 0,
  total_sent INT NOT NULL DEFAULT 0,
  total_delivered INT NOT NULL DEFAULT 0,
  total_read INT NOT NULL DEFAULT 0,
  total_converted INT NOT NULL DEFAULT 0,
  total_failed INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES public.campaign_executions(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaign_definitions(id) ON DELETE CASCADE,
  customer_id VARCHAR(128),
  phone_number VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'clicked', 'converted', 'suppressed', 'failed')),
  discount_code VARCHAR(64),
  tracking_url TEXT,
  meta_wamid VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. PERSONALIZED DISCOUNT ENGINE (Dashboard-controlled safeguards)
CREATE TABLE IF NOT EXISTS public.personalized_discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  max_discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  max_fixed_amount NUMERIC(10, 2) NOT NULL DEFAULT 200.00,
  eligible_segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligible_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  require_approval_above_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  require_approval_above_amount NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS public.personalized_discount_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(128),
  phone_number VARCHAR(32) NOT NULL,
  code VARCHAR(64) NOT NULL,
  discount_type VARCHAR(32) NOT NULL,
  discount_value NUMERIC(10, 2) NOT NULL,
  authorized_by VARCHAR(32) NOT NULL CHECK (authorized_by IN ('ai', 'owner', 'predefined_campaign')),
  approval_id UUID,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. SUPPLIER & PROCUREMENT MANAGEMENT + VOICE CALLING
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(255),
  address TEXT,
  gst_number VARCHAR(32),
  materials_supplied JSONB NOT NULL DEFAULT '[]'::jsonb,
  products_supplied JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_terms VARCHAR(128) DEFAULT 'Net 30',
  lead_time_days INT DEFAULT 7,
  min_order_value NUMERIC(12, 2) DEFAULT 5000.00,
  rating NUMERIC(3, 2) DEFAULT 5.00,
  notes TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.supplier_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_name VARCHAR(255) NOT NULL,
  material_code VARCHAR(64),
  unit VARCHAR(32) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  moq NUMERIC(10, 2) NOT NULL DEFAULT 1.0,
  lead_time_days INT DEFAULT 7,
  is_primary_supplier BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  rfq_number VARCHAR(64) NOT NULL,
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  terms TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  interaction_type VARCHAR(64) NOT NULL CHECK (interaction_type IN ('call', 'whatsapp', 'email', 'meeting', 'quotation_request', 'price_negotiation', 'delivery_followup')),
  initiated_by VARCHAR(32) NOT NULL DEFAULT 'ai' CHECK (initiated_by IN ('ai', 'owner')),
  subject VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  proposed_terms JSONB DEFAULT '{}'::jsonb,
  agreed_terms JSONB DEFAULT '{}'::jsonb,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  caller_identity VARCHAR(64) NOT NULL DEFAULT 'Mintara Bites Manager',
  provider VARCHAR(32) NOT NULL DEFAULT 'mock' CHECK (provider IN ('exotel', 'sarvam', 'mock', 'twilio')),
  provider_call_id VARCHAR(128),
  call_status VARCHAR(32) NOT NULL DEFAULT 'initiated' CHECK (call_status IN ('initiated', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed', 'refused')),
  duration_seconds INT DEFAULT 0,
  recipient_language VARCHAR(32) DEFAULT 'gu-IN',
  transcript TEXT,
  recording_url TEXT,
  tentative_agreement JSONB DEFAULT '{}'::jsonb,
  approval_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. KNOWLEDGE CENTRE, VECTOR RAG & CONTINUOUS LEARNING
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(32) NOT NULL CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'csv', 'txt', 'image', 'json')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT,
  category VARCHAR(64) NOT NULL CHECK (category IN ('sop', 'product', 'policy', 'supplier', 'manufacturing', 'commercial', 'general')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('processing', 'active', 'rejected', 'archived')),
  version INT NOT NULL DEFAULT 1,
  conflict_detected BOOLEAN NOT NULL DEFAULT false,
  conflict_details TEXT,
  is_owner_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  extracted_text TEXT NOT NULL,
  structured_facts JSONB DEFAULT '[]'::jsonb,
  uploaded_by VARCHAR(128) DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.knowledge_document_versions(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  embedding_json JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  memory_type VARCHAR(32) NOT NULL CHECK (memory_type IN ('business', 'customer', 'operational')),
  key VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  source_reference VARCHAR(255),
  confidence NUMERIC(3, 2) DEFAULT 1.00,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  verified_by VARCHAR(128) DEFAULT 'owner',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, memory_type, key)
);

CREATE TABLE IF NOT EXISTS public.continuous_learning_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  topic VARCHAR(255) NOT NULL,
  observed_pattern TEXT NOT NULL,
  proposed_addition TEXT NOT NULL,
  proposed_policy TEXT,
  rationale TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. MANUFACTURING INTELLIGENCE, RECIPES & BATCHES
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'seeds' CHECK (category IN ('seeds', 'spices', 'sweeteners', 'aroma_extracts', 'packaging', 'consumables')),
  unit VARCHAR(32) NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'grams', 'litres', 'ml', 'pieces', 'packets')),
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
  minimum_reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 10.000,
  target_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 50.000,
  cost_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  shelf_life_days INT DEFAULT 180,
  storage_conditions VARCHAR(255) DEFAULT 'Dry & Cool place',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  yield_quantity NUMERIC(10, 3) NOT NULL,
  yield_unit VARCHAR(32) NOT NULL DEFAULT 'kg',
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, sku, version)
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  quantity NUMERIC(10, 3) NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT 'kg',
  loss_percentage NUMERIC(5, 2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number VARCHAR(64) NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  target_quantity NUMERIC(10, 3) NOT NULL,
  planned_start_date DATE NOT NULL,
  planned_completion_date DATE NOT NULL,
  actual_start_date DATE,
  actual_completion_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL,
  batch_number VARCHAR(64) NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  quantity_produced NUMERIC(10, 3) NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT 'kg',
  yield_percentage NUMERIC(5, 2) DEFAULT 100.00,
  manufacturing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'released' CHECK (status IN ('quarantine', 'released', 'rejected')),
  batch_cost NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, batch_number)
);

CREATE TABLE IF NOT EXISTS public.quality_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  inspector VARCHAR(128) DEFAULT 'QC Team',
  parameters_tested JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_passed BOOLEAN NOT NULL DEFAULT true,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finished_goods_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  batch_id UUID REFERENCES public.production_batches(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 0,
  location VARCHAR(128) DEFAULT 'Surat Warehouse',
  expiry_date DATE,
  reserved_quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.procurement_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  forecasted_demand_qty NUMERIC(12, 3) NOT NULL,
  current_stock NUMERIC(12, 3) NOT NULL,
  reorder_qty_recommended NUMERIC(12, 3) NOT NULL,
  recommended_order_date DATE NOT NULL,
  required_by_date DATE NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. FINANCIAL INTELLIGENCE & UNIT ECONOMICS
CREATE TABLE IF NOT EXISTS public.financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_type VARCHAR(32) NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  gross_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  net_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  cogs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  gross_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  shipping_costs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  payment_gateway_fees NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  discounts_given NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  refunds NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  cod_costs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  rto_losses NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  net_profit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  cac NUMERIC(10, 2),
  roas NUMERIC(5, 2),
  clv NUMERIC(10, 2),
  verified_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, snapshot_date, period_type)
);

CREATE TABLE IF NOT EXISTS public.unit_economics_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  cogs_verified NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  packaging_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  shipping_cost_estimate NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  gateway_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
  return_rate_estimate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

-- 11. APPROVALS & LEVEL 3 CONTROLLED AUTONOMY
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  initiating_agent VARCHAR(64) NOT NULL,
  action_type VARCHAR(64) NOT NULL CHECK (action_type IN (
    'refund',
    'discount_override',
    'order_cancellation',
    'supplier_purchase',
    'supplier_commitment',
    'policy_change',
    'mass_campaign',
    'customer_data_deletion'
  )),
  target_entity_type VARCHAR(64) NOT NULL,
  target_entity_id VARCHAR(128) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_reason TEXT NOT NULL,
  financial_impact NUMERIC(12, 2) DEFAULT 0.00,
  risk_assessment VARCHAR(32) NOT NULL DEFAULT 'medium' CHECK (risk_assessment IN ('low', 'medium', 'high', 'critical')),
  recommendation TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed', 'cancelled')),
  requested_by VARCHAR(128) NOT NULL DEFAULT 'ai_orchestrator',
  approved_by VARCHAR(128),
  approved_at TIMESTAMPTZ,
  execution_result JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. OPERATIONAL ALERTS & ANOMALIES
CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  severity VARCHAR(32) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category VARCHAR(64) NOT NULL CHECK (category IN ('support', 'logistics', 'supplier', 'manufacturing', 'financial', 'security', 'ai_system')),
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  related_entity_type VARCHAR(64),
  related_entity_id VARCHAR(128),
  conversation_id UUID,
  recommended_action TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by VARCHAR(128),
  resolved_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. ECOMMERCE CHANGE INTELLIGENCE
CREATE TABLE IF NOT EXISTS public.ecommerce_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type VARCHAR(64) NOT NULL CHECK (entity_type IN ('product', 'price', 'inventory', 'variant', 'promo', 'order_pattern')),
  entity_id VARCHAR(128) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  change_source VARCHAR(32) NOT NULL DEFAULT 'poll_reconciliation' CHECK (change_source IN ('webhook', 'poll_reconciliation')),
  business_impact TEXT,
  recommended_action TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source VARCHAR(64) NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_record_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'success',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, source)
);

-- 14. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant ON public.customer_segments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_consent_phone ON public.customer_consent(phone_number);
CREATE INDEX IF NOT EXISTS idx_campaign_def_type ON public.campaign_definitions(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaign_recip_status ON public.campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_supplier_calls_status ON public.supplier_calls(call_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_cat ON public.knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_raw_materials_code ON public.raw_materials(code);
CREATE INDEX IF NOT EXISTS idx_prod_batches_exp ON public.production_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_alerts_status_sev ON public.operational_alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_ecom_change_entity ON public.ecommerce_change_history(entity_type, entity_id);
