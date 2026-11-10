-- ==============================================================================
-- CLEAN RESET / TEARDOWN SCRIPT (delete.sql)
-- WhatsApp Automation Platform
--
-- Running this script cleanly wipes all platform tables, legacy schemas, and views.
-- ==============================================================================

-- 1. DROP LEGACY CROSS-SCHEMA VIEWS
DROP VIEW IF EXISTS support.conversations CASCADE;
DROP VIEW IF EXISTS support.messages CASCADE;
DROP VIEW IF EXISTS support.tickets CASCADE;
DROP VIEW IF EXISTS marketing.dispatches CASCADE;
DROP VIEW IF EXISTS messaging.receipts CASCADE;
DROP VIEW IF EXISTS integration.worker_jobs CASCADE;
DROP VIEW IF EXISTS public.ad_referrals CASCADE;
DROP VIEW IF EXISTS integration.ad_referrals CASCADE;
DROP VIEW IF EXISTS ecommerce.customers CASCADE;
DROP VIEW IF EXISTS ecommerce.orders CASCADE;
DROP VIEW IF EXISTS ecommerce.order_items CASCADE;
DROP VIEW IF EXISTS ecommerce.products CASCADE;
DROP VIEW IF EXISTS ecommerce.product_variants CASCADE;
DROP VIEW IF EXISTS ecommerce.cart_items CASCADE;

-- 2. DROP DOMAIN SCHEMAS
DROP SCHEMA IF EXISTS integration CASCADE;
DROP SCHEMA IF EXISTS marketing CASCADE;
DROP SCHEMA IF EXISTS support CASCADE;
DROP SCHEMA IF EXISTS messaging CASCADE;
DROP SCHEMA IF EXISTS ecommerce CASCADE;
DROP SCHEMA IF EXISTS whatsapp_platform CASCADE;

-- 3. DROP LEGACY STORED PROCEDURES
DROP FUNCTION IF EXISTS public.create_checkout_order CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_promo_usage CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_abandoned_orders CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_customer_metrics CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;

-- 4. DROP DEAD / BLOAT TABLES
DROP TABLE IF EXISTS public.wholesale_leads CASCADE;
DROP TABLE IF EXISTS public.b2b_wholesale_leads CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.omnichannel_acquisition_leads CASCADE;
DROP TABLE IF EXISTS public.crm_activities CASCADE;
DROP TABLE IF EXISTS public.system_logs CASCADE;
DROP TABLE IF EXISTS public.analytics_events CASCADE;
DROP TABLE IF EXISTS public.rate_limit_buckets CASCADE;
DROP TABLE IF EXISTS public.customer_addresses CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.webhook_idempotency CASCADE;

-- 5. DROP PLATFORM CORE TABLES
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

-- 6. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
