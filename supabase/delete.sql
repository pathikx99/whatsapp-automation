-- ==============================================================================
-- MINTARA AI PLATFORM - TEARDOWN & RESET SCRIPT (delete.sql)
-- ==============================================================================
-- Running this script cleanly wipes all platform tables, legacy tables, views,
-- schemas, and functions. Safe to run repeatedly (fully idempotent).
-- ==============================================================================

-- 1. DROP EXTENSION / DOMAIN SCHEMAS IF PRESENT
DROP SCHEMA IF EXISTS integration CASCADE;
DROP SCHEMA IF EXISTS marketing CASCADE;
DROP SCHEMA IF EXISTS support CASCADE;
DROP SCHEMA IF EXISTS messaging CASCADE;
DROP SCHEMA IF EXISTS ecommerce CASCADE;
DROP SCHEMA IF EXISTS whatsapp_platform CASCADE;

-- 2. EXPLICIT DROP OF ALL KNOWN PLATFORM TABLES (CASCADE handles foreign keys)
DROP TABLE IF EXISTS public.ai_audit_logs CASCADE;
DROP TABLE IF EXISTS public.ai_report_deliveries CASCADE;
DROP TABLE IF EXISTS public.ai_daily_reports CASCADE;
DROP TABLE IF EXISTS public.ai_report_settings CASCADE;
DROP TABLE IF EXISTS public.ai_task_executions CASCADE;
DROP TABLE IF EXISTS public.ai_activity_logs CASCADE;
DROP TABLE IF EXISTS public.abandoned_cart_logs CASCADE;
DROP TABLE IF EXISTS public.promo_codes CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.processed_webhooks CASCADE;
DROP TABLE IF EXISTS public.company_settings CASCADE;
DROP TABLE IF EXISTS public.ndr_instructions CASCADE;
DROP TABLE IF EXISTS public.ad_referrals CASCADE;
DROP TABLE IF EXISTS public.worker_jobs CASCADE;
DROP TABLE IF EXISTS public.messaging_receipts CASCADE;
DROP TABLE IF EXISTS public.marketing_dispatches CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.support_messages CASCADE;
DROP TABLE IF EXISTS public.support_conversations CASCADE;

-- 3. DYNAMICALLY DROP ANY REMAINING PUBLIC VIEWS & TABLES SAFELY
DO $$
DECLARE
  r RECORD;
  target_names text[] := ARRAY[
    'ad_referrals',
    'worker_jobs',
    'support_conversations', 'conversations',
    'support_messages', 'messages',
    'support_tickets', 'tickets',
    'marketing_dispatches', 'dispatches',
    'messaging_receipts', 'receipts',
    'ndr_instructions',
    'company_settings',
    'processed_webhooks', 'webhook_idempotency',
    'reviews',
    'promo_codes',
    'abandoned_cart_logs', 'abandoned_cart_recovery_logs',
    'ai_activity_logs',
    'ai_task_executions',
    'ai_daily_reports',
    'ai_report_deliveries',
    'ai_report_settings',
    'ai_audit_logs',
    'wholesale_leads', 'b2b_wholesale_leads',
    'leads', 'omnichannel_acquisition_leads',
    'crm_activities',
    'system_logs',
    'analytics_events',
    'rate_limit_buckets',
    'customer_addresses',
    'payments',
    'shipments',
    'cart_items',
    'order_items',
    'orders',
    'product_variants',
    'products',
    'customers'
  ];
BEGIN
  -- First drop views in public schema if any match
  FOR r IN (
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = ANY(target_names)
  ) LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE;', r.table_name);
  END LOOP;

  -- Then drop base tables in public schema if any match
  FOR r IN (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name = ANY(target_names)
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE;', r.table_name);
  END LOOP;
END $$;

-- 4. DROP STORED PROCEDURES & FUNCTIONS
DROP FUNCTION IF EXISTS public.create_checkout_order CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_promo_usage CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_abandoned_orders CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_customer_metrics CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;

-- 5. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
