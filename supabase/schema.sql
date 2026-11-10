-- ==============================================================================
-- WHATSAPP AUTOMATION PLATFORM - REFINED DATABASE SCHEMA
-- Version: 5.0 (Streamlined Platform Architecture)
-- ==============================================================================
-- This schema belongs strictly to the WhatsApp Marketing & AI Support Platform.
-- All external e-commerce data (customers, products, variants, orders, cart_items)
-- is queried directly from the E-Commerce Supabase instance (ECOMMERCE_SUPABASE_URL).
--
-- Platform Core Tables (13 Tables):
-- 1. support_conversations  - Active/escalated customer session state
-- 2. support_messages       - Multi-turn conversation chat history
-- 3. support_tickets        - Human escalation tracking & resolution
-- 4. marketing_dispatches   - 14-day anti-fatigue marketing broadcast records
-- 5. messaging_receipts     - WhatsApp Meta status receipts (sent/delivered/read)
-- 6. worker_jobs            - Asynchronous background task queue
-- 7. ad_referrals           - Click-to-WhatsApp (CTWA) ad attribution & ROAS tracking
-- 8. ndr_instructions       - Logistics Non-Delivery Report customer instructions
-- 9. company_settings       - Dynamic business profile, markdown, & system knowledge
-- 10. processed_webhooks    - Inbound webhook idempotency ledger
-- 11. reviews               - WhatsApp CSAT feedback & synced multi-platform reviews
-- 12. promo_codes           - Dynamic single-use cart recovery promotional codes
-- 13. abandoned_cart_logs   - Abandoned cart campaign tracking & recovery tokens
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
-- 3. MARKETING, MESSAGING GATEWAY & QUEUES
-- ------------------------------------------------------------------------------

-- 3.1 Marketing Dispatches (14-Day Anti-Fatigue Message Tracking)
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

-- 3.3 Worker Queue Jobs (Asynchronous Background Tasks)
CREATE TABLE IF NOT EXISTS public.worker_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retries INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error TEXT,
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
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text,
  created_at timestamptz DEFAULT now()
);

-- 4.5 Customer CSAT & Synced Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text NOT NULL DEFAULT 'general',
  customer_id uuid,
  customer_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  comment text NOT NULL,
  images jsonb DEFAULT '[]'::jsonb,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id)
);

-- 4.6 Dynamic Promo Codes (Incentives / Cart Recovery)
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type = ANY (ARRAY['flat'::text, 'percent'::text, 'free_delivery'::text])),
  value numeric NOT NULL,
  min_subtotal numeric,
  max_discount numeric,
  expires_at timestamp with time zone,
  usage_limit integer,
  used integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promo_codes_pkey PRIMARY KEY (id)
);

-- 4.7 Abandoned Cart Recovery Logs
CREATE TABLE IF NOT EXISTS public.abandoned_cart_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  customer_id uuid,
  order_id uuid,
  customer_name text,
  phone text,
  cart_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  recovery_token text UNIQUE NOT NULL,
  stage integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  discount_code text,
  last_email_sent_at timestamp with time zone,
  recovered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
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
CREATE INDEX IF NOT EXISTS idx_ad_referrals_phone ON public.ad_referrals (phone_number);
CREATE INDEX IF NOT EXISTS idx_ad_referrals_ad_id ON public.ad_referrals (ad_id);
CREATE INDEX IF NOT EXISTS idx_ndr_instructions_phone ON public.ndr_instructions (phone_number);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_lookup ON public.abandoned_cart_logs (email, status, created_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_token ON public.abandoned_cart_logs (recovery_token);

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) & SERVICE ROLE PERMISSIONS
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

    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;
  END IF;
END $$;

-- Public Read Policies (for reviews)
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Public reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);

-- ------------------------------------------------------------------------------
-- 7. RELOAD POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
