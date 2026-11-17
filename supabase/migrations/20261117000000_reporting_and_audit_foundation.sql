-- ==============================================================================
-- MIGRATION: 20261117000000_reporting_and_audit_foundation.sql
-- MINTARA AI PLATFORM - REPORTING, AUDIT & WORKER CONCURRENCY FOUNDATION
-- ==============================================================================
-- Establishes:
-- 1. Worker Queue Job Locking & Dead-Letter State
-- 2. AI Activity Logs (Granular Event Tracking for Support, Enquiries & Tasks)
-- 3. AI Task Executions (Lifecycle Tracking)
-- 4. AI Daily Reports (22:00 IST Scheduled Intelligence Reports)
-- 5. AI Report Deliveries (WhatsApp & Dashboard Delivery Tracking)
-- 6. AI Report Settings (Timezone Asia/Kolkata, Schedule & Recipients)
-- 7. AI Audit Logs (Sensitive Actions: Refunds, Cancellations, Discounts, Logins)
-- ==============================================================================

-- 1. WORKER QUEUE CONCURRENCY & DEAD-LETTER UPGRADES
ALTER TABLE public.worker_jobs
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(128);

DO $$
BEGIN
  -- Update check constraint on worker_jobs to support dead_letter if needed
  ALTER TABLE public.worker_jobs DROP CONSTRAINT IF EXISTS worker_jobs_status_check;
  ALTER TABLE public.worker_jobs ADD CONSTRAINT worker_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_worker_jobs_claim
  ON public.worker_jobs (status, scheduled_for, locked_at);

-- 2. AI ACTIVITY LOGS
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

CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_event_time
  ON public.ai_activity_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_phone
  ON public.ai_activity_logs (phone_number);
CREATE INDEX IF NOT EXISTS idx_ai_activity_logs_created
  ON public.ai_activity_logs (created_at DESC);

-- 3. AI TASK EXECUTIONS
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

CREATE INDEX IF NOT EXISTS idx_ai_task_executions_task_time
  ON public.ai_task_executions (task_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_task_executions_status
  ON public.ai_task_executions (status);

-- 4. AI DAILY REPORTS (Scheduled for 22:00 IST)
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

CREATE INDEX IF NOT EXISTS idx_ai_daily_reports_date
  ON public.ai_daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_daily_reports_status
  ON public.ai_daily_reports (status);

-- 5. AI REPORT DELIVERIES
CREATE TABLE IF NOT EXISTS public.ai_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.ai_daily_reports(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL CHECK (channel IN ('whatsapp', 'dashboard', 'email')),
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'failed')),
  meta_wamid VARCHAR(255),
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_report_deliveries_report
  ON public.ai_report_deliveries (report_id);
CREATE INDEX IF NOT EXISTS idx_ai_report_deliveries_channel_recipient
  ON public.ai_report_deliveries (channel, recipient);

-- 6. AI REPORT SETTINGS
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

-- 7. AI AUDIT LOGS
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

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_action_time
  ON public.ai_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_actor
  ON public.ai_audit_logs (actor_type);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_resource
  ON public.ai_audit_logs (resource_type, resource_id);

-- 8. ROW LEVEL SECURITY (RLS) & SERVICE ROLE PRIVILEGES
ALTER TABLE public.ai_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
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
  END IF;
END $$;
