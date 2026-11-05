-- ==============================================================================
-- Migration: 20261105000000_platform_schemas.sql
-- Description: Unified initial deployment migration for WhatsApp Automation Platform.
--              Initializes schemas (integration, marketing, support, messaging),
--              core operational tables in public, indexes, RLS, and permissions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ISOLATED DOMAIN SCHEMAS
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS integration;
COMMENT ON SCHEMA integration IS 'Isolated schema for ecommerce connectors, sync, and webhook events';

CREATE SCHEMA IF NOT EXISTS marketing;
COMMENT ON SCHEMA marketing IS 'Isolated schema for marketing campaigns, fatigue tracking, and dispatches';

CREATE SCHEMA IF NOT EXISTS support;
COMMENT ON SCHEMA support IS 'Isolated schema for AI customer support, multi-turn history, and tickets';

CREATE SCHEMA IF NOT EXISTS messaging;
COMMENT ON SCHEMA messaging IS 'Isolated schema for WhatsApp gateway messaging, status receipts, and queues';

-- ------------------------------------------------------------------------------
-- 2. SCHEMA USAGE & ROLE PERMISSIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Grant usage to postgres superuser
  GRANT USAGE, CREATE ON SCHEMA public, integration, marketing, support, messaging TO postgres;

  -- Grant usage to service_role (used by backend API, worker, and orchestrators)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE, CREATE ON SCHEMA public, integration, marketing, support, messaging TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public, integration, marketing, support, messaging TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public, integration, marketing, support, messaging TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public, integration, marketing, support, messaging GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public, integration, marketing, support, messaging GRANT ALL ON SEQUENCES TO service_role;
  END IF;

  -- Restrict anon and authenticated users from accessing internal schemas by default
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA integration, marketing, support, messaging FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA integration, marketing, support, messaging FROM authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. CORE PLATFORM TABLES (PUBLIC SCHEMA FOR POSTGREST REST API ACCESS)
-- ------------------------------------------------------------------------------

-- 3.1 Support Conversations
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

CREATE INDEX IF NOT EXISTS idx_support_conversations_phone ON public.support_conversations (phone_number);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON public.support_conversations (status);

-- 3.2 Chronological Support Messages (Multi-Turn Conversation Memory)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('customer', 'assistant', 'human_agent', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_phone ON public.support_messages (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON public.support_messages (conversation_id, created_at ASC);

-- 3.3 Support Escalation Tickets (Human Agent Handoff)
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

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_phone ON public.support_tickets (phone_number);

-- 3.4 Marketing Dispatches (14-Day Message Fatigue Tracking)
CREATE TABLE IF NOT EXISTS public.marketing_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  segment_type VARCHAR(64) NOT NULL,
  message_preview TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_dispatches_phone_time ON public.marketing_dispatches (phone_number, dispatched_at DESC);

-- 3.5 Messaging Receipts (WhatsApp Meta Status Tracking)
CREATE TABLE IF NOT EXISTS public.messaging_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid VARCHAR(255) NOT NULL UNIQUE,
  recipient VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_receipts_wamid ON public.messaging_receipts (wamid);
CREATE INDEX IF NOT EXISTS idx_messaging_receipts_recipient ON public.messaging_receipts (recipient);

-- 3.6 Worker Queue Jobs (Background Asynchronous Execution)
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

CREATE INDEX IF NOT EXISTS idx_worker_jobs_status_sched ON public.worker_jobs (status, scheduled_for ASC);

-- ------------------------------------------------------------------------------
-- 4. DOMAIN SCHEMA VIEWS (OPTIONAL CROSS-SCHEMA SHORTCUTS)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW support.conversations AS SELECT * FROM public.support_conversations;
CREATE OR REPLACE VIEW support.messages AS SELECT * FROM public.support_messages;
CREATE OR REPLACE VIEW support.tickets AS SELECT * FROM public.support_tickets;
CREATE OR REPLACE VIEW marketing.dispatches AS SELECT * FROM public.marketing_dispatches;
CREATE OR REPLACE VIEW messaging.receipts AS SELECT * FROM public.messaging_receipts;
CREATE OR REPLACE VIEW integration.worker_jobs AS SELECT * FROM public.worker_jobs;

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) & SERVICE ROLE POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_jobs ENABLE ROW LEVEL SECURITY;

-- Allow full backend service_role access across all tables
DO $$
BEGIN
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
END $$;
