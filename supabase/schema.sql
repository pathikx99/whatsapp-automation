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
