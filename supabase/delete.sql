-- ==============================================================================
-- CLEAN RESET / TEARDOWN SCRIPT (delete.sql)
-- Mintara Bites & WhatsApp Platform
--
-- Running this script completely wipes all application tables, views, stored
-- procedures, policies, and domain schemas so you can start completely fresh.
--
-- HOW TO USE:
-- 1. In Supabase Dashboard -> SQL Editor, run this script (delete.sql).
-- 2. Then run schema.sql to recreate and seed the complete fresh database.
-- ==============================================================================

-- 1. DROP CROSS-SCHEMA VIEWS
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS support.conversations CASCADE;
DROP VIEW IF EXISTS support.messages CASCADE;
DROP VIEW IF EXISTS support.tickets CASCADE;
DROP VIEW IF EXISTS marketing.dispatches CASCADE;
DROP VIEW IF EXISTS messaging.receipts CASCADE;
DROP VIEW IF EXISTS integration.worker_jobs CASCADE;
DROP VIEW IF EXISTS ecommerce.customers CASCADE;
DROP VIEW IF EXISTS ecommerce.orders CASCADE;
DROP VIEW IF EXISTS ecommerce.order_items CASCADE;
DROP VIEW IF EXISTS ecommerce.products CASCADE;
DROP VIEW IF EXISTS ecommerce.product_variants CASCADE;
DROP VIEW IF EXISTS ecommerce.cart_items CASCADE;

-- 2. DROP DOMAIN SCHEMAS
-- ------------------------------------------------------------------------------
DROP SCHEMA IF EXISTS integration CASCADE;
DROP SCHEMA IF EXISTS marketing CASCADE;
DROP SCHEMA IF EXISTS support CASCADE;
DROP SCHEMA IF EXISTS messaging CASCADE;
DROP SCHEMA IF EXISTS ecommerce CASCADE;
DROP SCHEMA IF EXISTS whatsapp_platform CASCADE;

-- 3. DROP STORED PROCEDURES & BUSINESS LOGIC FUNCTIONS
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_checkout_order(text, uuid, jsonb, text, text, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_checkout_order CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.decrement_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_variant_stock(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.increment_variant_stock CASCADE;
DROP FUNCTION IF EXISTS public.increment_promo_usage(text) CASCADE;
DROP FUNCTION IF EXISTS public.increment_promo_usage CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_abandoned_orders() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_abandoned_orders CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_customer_metrics(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_customer_metrics CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;

-- 4. DROP APPLICATION TABLES IN PUBLIC SCHEMA (CASCADE ensures foreign keys resolve)
-- ------------------------------------------------------------------------------
-- WhatsApp Platform Tables
DROP TABLE IF EXISTS public.worker_jobs CASCADE;
DROP TABLE IF EXISTS public.messaging_receipts CASCADE;
DROP TABLE IF EXISTS public.marketing_dispatches CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.support_messages CASCADE;
DROP TABLE IF EXISTS public.support_conversations CASCADE;

-- Infrastructure & CRM Tables
DROP TABLE IF EXISTS public.rate_limit_buckets CASCADE;
DROP TABLE IF EXISTS public.processed_webhooks CASCADE;
DROP TABLE IF EXISTS public.crm_activities CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.wholesale_leads CASCADE;
DROP TABLE IF EXISTS public.abandoned_cart_logs CASCADE;
DROP TABLE IF EXISTS public.analytics_events CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.promo_codes CASCADE;
DROP TABLE IF EXISTS public.system_logs CASCADE;

-- E-Commerce Core Transactional Tables
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.cart_items CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.customer_addresses CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;

-- Legacy / Alternate table names (for thorough clean-up)
DROP TABLE IF EXISTS public.abandoned_cart_recovery_logs CASCADE;
DROP TABLE IF EXISTS public.b2b_wholesale_leads CASCADE;
DROP TABLE IF EXISTS public.omnichannel_acquisition_leads CASCADE;
DROP TABLE IF EXISTS public.webhook_idempotency CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;

-- 5. RELOAD POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

