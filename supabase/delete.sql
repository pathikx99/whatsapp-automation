-- ==============================================================================
-- CLEAN RESET / TEARDOWN SCRIPT (delete.sql)
-- WhatsApp Automation Platform
--
-- Running this script cleanly wipes all platform tables, legacy schemas, and views.
-- Foolproof: Safely handles objects whether they were created as tables or views.
-- ==============================================================================

-- 1. DROP DOMAIN SCHEMAS (CASCADE removes all views and tables within them)
DROP SCHEMA IF EXISTS integration CASCADE;
DROP SCHEMA IF EXISTS marketing CASCADE;
DROP SCHEMA IF EXISTS support CASCADE;
DROP SCHEMA IF EXISTS messaging CASCADE;
DROP SCHEMA IF EXISTS ecommerce CASCADE;
DROP SCHEMA IF EXISTS whatsapp_platform CASCADE;

-- 2. DYNAMICALLY DROP PUBLIC VIEWS & TABLES SAFELY (Prevents "is not a view" / "is not a table" errors)
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

-- 3. DROP LEGACY STORED PROCEDURES
DROP FUNCTION IF EXISTS public.create_checkout_order CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_promo_usage CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_abandoned_orders CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_customer_metrics CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;

-- 4. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
