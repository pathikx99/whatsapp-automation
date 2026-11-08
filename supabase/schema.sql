-- ==============================================================================
-- MINTARA BITES & WHATSAPP AUTOMATION - COMPLETE UNIFIED DATABASE SCHEMA & SEED
-- Version: 4.0 (Master Consolidated, Autonomous, Production-Ready)
-- ==============================================================================
-- This single unified migration script initializes the complete database for
-- the standalone WhatsApp Automation Platform and its E-Commerce data layer:
--
-- 1. EXTENSIONS & DOMAIN SCHEMAS
--    - pgcrypto & uuid-ossp
--    - Isolated schemas: integration, marketing, support, messaging
--
-- 2. E-COMMERCE CORE TABLES (PUBLIC SCHEMA)
--    - customers, customer_addresses, products, product_variants, cart_items,
--      orders, order_items, payments, shipments, system_logs, promo_codes,
--      reviews, analytics_events, abandoned_cart_logs, wholesale_leads, leads,
--      crm_activities, processed_webhooks, rate_limit_buckets
--
-- 3. WHATSAPP AUTOMATION PLATFORM TABLES (PUBLIC SCHEMA)
--    - support_conversations (persistent session & escalation state)
--    - support_messages (multi-turn conversation memory)
--    - support_tickets (human agent escalation tracking)
--    - marketing_dispatches (14-day anti-fatigue dispatch tracking)
--    - messaging_receipts (WhatsApp Meta status receipts: sent/delivered/read)
--    - worker_jobs (asynchronous background queue execution)
--
-- 4. BUSINESS LOGIC & STORED PROCEDURES
--    - promo code usage tracking
--    - atomic stock increment / decrement
--    - create_checkout_order with deterministic deadlock-free locking
--    - cleanup_abandoned_orders
--    - recalculate_customer_metrics (Customer 360 RFM segmentation)
--
-- 5. PERFORMANCE & SEARCH INDEXES
--    - Composite, GIN, and partial indexes across store & platform tables
--
-- 6. MINTARA BITES PRODUCT SEED DATA
--    - Paan Mukhwas (150g, 300g, 500g)
--    - Seeds Fusion (Regular 100g/200g, Lime 100g/200g)
--    - Coconut Crunch (100g, 200g)
--    - Mintara Trio Pack (350g)
--    - Family Feast Pack (700g - unlocks free shipping)
--    - Test Product ₹2 (for checkout verification)
--    - Promotional Discount Codes (MINFREE, WELCOME10, MINTARA50, FREESHIP, FESTIVE20)
--
-- 7. SECURITY, ROW LEVEL SECURITY (RLS) & SERVICE ROLE PERMISSIONS
--    - Full access granted to service_role for API and worker processes
--    - Public read policies for storefront & catalog inspection
--    - PostgREST Schema Cache Reload
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & DOMAIN SCHEMAS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- 3. E-COMMERCE CORE TABLES (PUBLIC SCHEMA)
-- ------------------------------------------------------------------------------

-- 3.1 Customers Table (with CRM Customer 360 intelligence fields)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  phone_verified boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  dob date,
  email_unsubscribed boolean NOT NULL DEFAULT false,
  customer_type text NOT NULL DEFAULT 'B2C' CHECK (customer_type IN ('B2C', 'B2B_WHOLESALE', 'CORPORATE_GIFTING', 'DISTRIBUTOR')),
  segment text NOT NULL DEFAULT 'NEW' CHECK (segment IN ('NEW', 'REGULAR', 'VIP', 'AT_RISK', 'CHURNED', 'COD_RISK')),
  tags text[] DEFAULT ARRAY[]::text[],
  admin_notes text,
  total_spend numeric DEFAULT 0,
  total_orders integer DEFAULT 0,
  last_order_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- Backward compatibility upgrade if customers table previously existed without CRM columns
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'B2C' CHECK (customer_type IN ('B2C', 'B2B_WHOLESALE', 'CORPORATE_GIFTING', 'DISTRIBUTOR')),
  ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'NEW' CHECK (segment IN ('NEW', 'REGULAR', 'VIP', 'AT_RISK', 'CHURNED', 'COD_RISK')),
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS total_spend numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 3.2 Customer Addresses Table
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  country text NOT NULL DEFAULT 'India'::text,
  pincode text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) 
    REFERENCES public.customers(id) ON DELETE CASCADE
);

-- 3.3 Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  description text,
  category text DEFAULT 'Mukhwas & Digestive Treats'::text,
  images jsonb DEFAULT '[]'::jsonb,
  requires_refrigeration boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- 3.4 Product Variants Table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  sku text UNIQUE,
  flavor text,
  weight_grams integer NOT NULL,
  price numeric NOT NULL,
  sale_price numeric,
  stock_qty integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_variants_pkey PRIMARY KEY (id),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) 
    REFERENCES public.products(id) ON DELETE CASCADE
);

-- 3.5 Cart Items Table
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  product_variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_customer_id_fkey FOREIGN KEY (customer_id) 
    REFERENCES public.customers(id) ON DELETE CASCADE,
  CONSTRAINT cart_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) 
    REFERENCES public.product_variants(id) ON DELETE CASCADE
);

-- 3.6 Orders Table (with marketing attribution & dispute flags)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  checkout_id text,
  customer_id uuid,
  status text NOT NULL DEFAULT 'PENDING'::text,
  payment_method text NOT NULL,
  payment_status text NOT NULL DEFAULT 'PENDING'::text,
  shipping_name text NOT NULL,
  shipping_phone text NOT NULL,
  shipping_address_line1 text NOT NULL,
  shipping_address_line2 text,
  shipping_city text NOT NULL,
  shipping_state text NOT NULL,
  shipping_pincode text NOT NULL,
  shipping_country text NOT NULL DEFAULT 'India'::text,
  subtotal numeric NOT NULL,
  shipping_fee numeric NOT NULL DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL,
  promo_code text,
  attribution_metadata jsonb DEFAULT '{}'::jsonb,
  admin_notes text,
  cancellation_reason text,
  is_flagged boolean DEFAULT false,
  flag_reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) 
    REFERENCES public.customers(id) ON DELETE SET NULL
);

-- Backward compatibility upgrade if orders table previously existed
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attribution_metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS is_flagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text;

-- 3.7 Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_variant_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  price_at_purchase numeric NOT NULL,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) 
    REFERENCES public.product_variants(id) ON DELETE SET NULL
);

-- 3.8 Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  payment_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'created'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE CASCADE
);

-- 3.9 Shipments Table
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  shiprocket_order_id text,
  shiprocket_shipment_id text,
  awb_code text,
  courier_name text,
  status text NOT NULL DEFAULT 'PENDING'::text,
  shiprocket_status text,
  tracking_activities jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT shipments_pkey PRIMARY KEY (id),
  CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE CASCADE
);

-- 3.10 System Logs Table
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  event_type text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO'::text,
  payload jsonb DEFAULT '{}'::jsonb,
  error_message text,
  retry_count integer DEFAULT 0,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_logs_pkey PRIMARY KEY (id),
  CONSTRAINT system_logs_order_id_fkey FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE SET NULL
);

-- 3.11 Promo Codes Table
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

-- 3.12 Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  customer_id uuid,
  customer_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  comment text NOT NULL,
  images jsonb DEFAULT '[]'::jsonb,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) 
    REFERENCES public.customers(id) ON DELETE SET NULL
);

-- 3.13 Analytics Events Table
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL,
  event_time timestamp with time zone NOT NULL DEFAULT now(),
  cart_snapshot jsonb,
  cart_value numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
);

-- 3.14 Abandoned Cart Recovery Logs Table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_name text,
  phone text,
  cart_snapshot jsonb NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  recovery_token text UNIQUE NOT NULL,
  stage integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  discount_code text,
  last_email_sent_at timestamp with time zone,
  recovered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 3.15 B2B Wholesale Leads Table
CREATE TABLE IF NOT EXISTS public.wholesale_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_person text NOT NULL,
  business_type text NOT NULL,
  city text NOT NULL,
  phone text NOT NULL,
  email text,
  products_of_interest jsonb DEFAULT '[]'::jsonb,
  estimated_volume text,
  message text,
  status text NOT NULL DEFAULT 'NEW',
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- 3.16 Omnichannel Acquisition Leads Table
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  phone text NOT NULL,
  email text,
  channel text NOT NULL,
  campaign_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'ARCHIVED')),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 3.17 CRM Activities & Touchpoints Table
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN (
    'NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'SAMPLE_SENT', 'STATUS_CHANGE', 'STAGE_CHANGE'
  )),
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'Admin',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.18 Webhook Idempotency & Rate Limiting Infrastructure
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  event_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

-- ------------------------------------------------------------------------------
-- 4. WHATSAPP AUTOMATION PLATFORM TABLES (PUBLIC SCHEMA)
-- ------------------------------------------------------------------------------

-- 4.1 Support Conversations (State, Mute Policy & Escalation Status)
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

-- 4.2 Support Messages (Multi-Turn Chat History for AI Context)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('customer', 'assistant', 'human_agent', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 Support Escalation Tickets (Human Agent Takeover)
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

-- 4.4 Marketing Dispatches (14-Day Anti-Fatigue Message Tracking)
CREATE TABLE IF NOT EXISTS public.marketing_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  segment_type VARCHAR(64) NOT NULL,
  message_preview TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5 Messaging Receipts (Meta Delivery & Read Status Receipts)
CREATE TABLE IF NOT EXISTS public.messaging_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid VARCHAR(255) NOT NULL UNIQUE,
  recipient VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6 Worker Queue Jobs (Asynchronous Background Tasks)
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

-- 4.7 Ad Referrals & Click-To-WhatsApp (CTWA) Attribution Tracking
CREATE TABLE IF NOT EXISTS integration.ad_referrals (
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

-- 4.8 Logistics NDR (Non-Delivery Report) Instructions
CREATE TABLE IF NOT EXISTS public.ndr_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  order_number VARCHAR(64),
  instructions TEXT NOT NULL,
  courier VARCHAR(64) DEFAULT 'courier',
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.9 Dynamic Business Settings & Knowledge (Supabase Storage & ChatGPT Action)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id VARCHAR(64) PRIMARY KEY DEFAULT 'current',
  profile JSONB NOT NULL,
  custom_markdown TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(64) DEFAULT 'system'
);

-- 4.10 Cross-Schema Views for Domain Isolation
CREATE OR REPLACE VIEW support.conversations AS SELECT * FROM public.support_conversations;
CREATE OR REPLACE VIEW support.messages AS SELECT * FROM public.support_messages;
CREATE OR REPLACE VIEW support.tickets AS SELECT * FROM public.support_tickets;
CREATE OR REPLACE VIEW marketing.dispatches AS SELECT * FROM public.marketing_dispatches;
CREATE OR REPLACE VIEW messaging.receipts AS SELECT * FROM public.messaging_receipts;
CREATE OR REPLACE VIEW integration.worker_jobs AS SELECT * FROM public.worker_jobs;
CREATE OR REPLACE VIEW public.ad_referrals AS SELECT * FROM integration.ad_referrals;

-- ------------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------

-- Customers & Addresses
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone_verified ON public.customers (phone, phone_verified);
CREATE INDEX IF NOT EXISTS idx_customers_email_verified ON public.customers (email, email_verified);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON public.customers (segment);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON public.customers (customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_total_spend ON public.customers (total_spend DESC);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses (customer_id);

-- Products & Variants
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants (sku);
CREATE INDEX IF NOT EXISTS idx_cart_items_customer_id ON public.cart_items (customer_id);

-- Orders & Attribution
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_checkout_id ON public.orders (checkout_id);
CREATE INDEX IF NOT EXISTS idx_orders_attribution ON public.orders USING gin (attribution_metadata);
CREATE INDEX IF NOT EXISTS idx_orders_flagged ON public.orders (is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON public.order_items (product_variant_id);

-- Promo Codes, Reviews & Logs
CREATE INDEX IF NOT EXISTS idx_promo_codes_expires_at ON public.promo_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_lookup ON public.abandoned_cart_logs (email, status, created_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_token ON public.abandoned_cart_logs (recovery_token);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_order_id ON public.abandoned_cart_logs (order_id);

-- Leads & CRM
CREATE INDEX IF NOT EXISTS idx_wholesale_leads_created_at ON public.wholesale_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_leads_status ON public.wholesale_leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_channel ON public.leads (channel);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON public.crm_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON public.crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_created ON public.crm_activities(created_at DESC);

-- WhatsApp Platform Operational Indexes
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

-- ------------------------------------------------------------------------------
-- 6. BUSINESS LOGIC & STORED PROCEDURES
-- ------------------------------------------------------------------------------

-- 6.1 Safely increment promo code usage
CREATE OR REPLACE FUNCTION public.increment_promo_usage(p_code text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.promo_codes
  SET used = used + 1
  WHERE code = p_code
    AND (
      usage_limit IS NULL
      OR used < usage_limit
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROMO_USAGE_LIMIT_REACHED';
  END IF;
END;
$$;

-- 6.2 Atomically decrement variant stock
CREATE OR REPLACE FUNCTION public.decrement_variant_stock(p_variant_id uuid, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  current_stock integer;
BEGIN
  SELECT stock_qty INTO current_stock
  FROM public.product_variants
  WHERE id = p_variant_id;

  IF current_stock IS NULL OR current_stock < p_quantity THEN
    RETURN FALSE;
  END IF;

  UPDATE public.product_variants
  SET stock_qty = stock_qty - p_quantity
  WHERE id = p_variant_id;

  RETURN TRUE;
END;
$$;

-- 6.3 Atomically increment variant stock (e.g. on order cancellation)
CREATE OR REPLACE FUNCTION public.increment_variant_stock(p_variant_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.product_variants
  SET stock_qty = stock_qty + p_quantity
  WHERE id = p_variant_id;
END;
$$;

-- 6.4 Atomic checkout order creation with inventory reservation
CREATE OR REPLACE FUNCTION public.create_checkout_order(
  p_order_number text,
  p_checkout_id text,
  p_customer_id uuid,
  p_status text,
  p_payment_method text,
  p_payment_status text,
  p_shipping_name text,
  p_shipping_phone text,
  p_shipping_address_line1 text,
  p_shipping_address_line2 text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_pincode text,
  p_shipping_country text,
  p_subtotal numeric,
  p_shipping_fee numeric,
  p_total_amount numeric,
  p_promo_code text,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_qty int;
  v_price numeric;
  v_current_stock int;
BEGIN
  -- 1. Check stock for all items first in deterministic UUID order to eliminate deadlocks
  FOR v_item IN 
    SELECT elem FROM jsonb_array_elements(p_items) AS elem
    ORDER BY (elem->>'variant_id')::uuid ASC
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    
    SELECT stock_qty INTO v_current_stock 
    FROM public.product_variants 
    WHERE id = v_variant_id FOR UPDATE;
    
    IF v_current_stock < v_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK';
    END IF;
  END LOOP;

  -- 2. Insert Order
  INSERT INTO public.orders (
    order_number, checkout_id, customer_id, status, payment_method, payment_status,
    shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_pincode, shipping_country,
    subtotal, shipping_fee, total_amount, promo_code, discount_amount, tax_amount
  ) VALUES (
    p_order_number, p_checkout_id, p_customer_id, p_status, p_payment_method, p_payment_status,
    p_shipping_name, p_shipping_phone, p_shipping_address_line1, p_shipping_address_line2,
    p_shipping_city, p_shipping_state, p_shipping_pincode, p_shipping_country,
    p_subtotal, p_shipping_fee, p_total_amount, p_promo_code, p_discount_amount, p_tax_amount
  ) RETURNING id INTO v_order_id;

  -- 3. Insert Order Items and Update Stock in the same deterministic order
  FOR v_item IN 
    SELECT elem FROM jsonb_array_elements(p_items) AS elem
    ORDER BY (elem->>'variant_id')::uuid ASC
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_price := (v_item->>'price')::numeric;
    
    INSERT INTO public.order_items (order_id, product_variant_id, quantity, price_at_purchase)
    VALUES (v_order_id, v_variant_id, v_qty, v_price);
    
    UPDATE public.product_variants
    SET stock_qty = stock_qty - v_qty
    WHERE id = v_variant_id;
  END LOOP;

  -- 4. Create initial pending shipment record
  INSERT INTO public.shipments (order_id, status)
  VALUES (v_order_id, 'PENDING')
  ON CONFLICT DO NOTHING;

  RETURN v_order_id;
END;
$$;

-- 6.5 Abandoned Order Cleanup & Inventory Release
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_orders()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  FOR v_order IN 
    SELECT id FROM public.orders 
    WHERE payment_status = 'CREATED' 
      AND created_at < NOW() - INTERVAL '30 minutes'
  LOOP
    FOR v_item IN SELECT product_variant_id, quantity FROM public.order_items WHERE order_id = v_order.id
    LOOP
      UPDATE public.product_variants
      SET stock_qty = stock_qty + v_item.quantity
      WHERE id = v_item.product_variant_id;
    END LOOP;

    UPDATE public.orders SET status = 'CANCELLED', payment_status = 'FAILED' WHERE id = v_order.id;
  END LOOP;
END;
$$;

-- 6.6 Atomic RFM Recalculation (Customer 360 Segmentation)
CREATE OR REPLACE FUNCTION public.recalculate_customer_metrics(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_spend numeric := 0;
  v_total_orders integer := 0;
  v_last_order timestamp with time zone;
  v_segment text := 'NEW';
BEGIN
  SELECT 
    COUNT(id),
    COALESCE(SUM(total_amount), 0),
    MAX(created_at)
  INTO v_total_orders, v_total_spend, v_last_order
  FROM public.orders
  WHERE customer_id = p_customer_id
    AND status <> 'CANCELLED';

  IF v_total_spend > 2000 OR v_total_orders >= 4 THEN
    v_segment := 'VIP';
  ELSIF v_total_orders >= 2 THEN
    v_segment := 'REGULAR';
  ELSIF v_last_order < NOW() - INTERVAL '60 days' THEN
    v_segment := 'AT_RISK';
  ELSE
    v_segment := 'NEW';
  END IF;

  UPDATE public.customers
  SET total_spend = v_total_spend,
      total_orders = v_total_orders,
      last_order_date = v_last_order,
      segment = v_segment,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. PRODUCT CATALOG & SEED DATA (MINTARA BITES CORE RANGE & COMBOS)
-- ------------------------------------------------------------------------------

-- 7.1 Seed Paan Mukhwas
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Paan Mukhwas',
        'paan-mukhwas',
        'A light, premium, and refreshing paan-flavoured mukhwas crafted without areca nut or supari. Designed for smooth after-meal digestive enjoyment and crisp texture.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_mukhwas_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "benefits": [
            "100% Supari & Areca Nut Free",
            "Crafted with natural gulkand, fennel & herbs",
            "Refrigerated freshness for crisp texture",
            "Natural long-lasting after-meal breath freshener",
            "Supports smooth post-meal digestion"
          ],
          "primaryKeyword": "paan mukhwas surat",
          "ingredients": [
            "Natural Gulkand – Pure rose petal preserve for cooling refreshment",
            "Fennel Seeds (Variyali) – Premium sweet fennel for aroma and digestion",
            "Dhanadal – Roasted coriander seeds for crisp digestive crunch",
            "Cardamom & Menthol – Natural spices for crisp, lingering fresh breath"
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_product_id, 'paan-mukhwas-150g', 'Original', 150, 199, 149, 100),
        (v_product_id, 'paan-mukhwas-300g', 'Original', 300, 299, 249, 100),
        (v_product_id, 'paan-mukhwas-500g', 'Original', 500, 499, 399, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 7.2 Seed Seeds Fusion (Regular & Lime)
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Seeds Fusion',
        'seed-fusion',
        'A wholesome blend of six premium seeds — white sesame, pumpkin, watermelon, sunflower, black sesame, and flax seeds. A nutritious and flavorful mouth freshener that supports digestion while satisfying your taste buds. Available in Regular and Lime variants.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png"
        ]'::jsonb,
        false,
        true,
        '{
          "benefits": [
            "Rich in protein, fiber, and healthy fats",
            "Supports healthy digestion",
            "Naturally packed with vitamins and minerals",
            "Helps keep you feeling full for longer",
            "No artificial flavors or preservatives",
            "A delicious and crunchy post-meal mouth freshener"
          ],
          "primaryKeyword": "seeds fusion mukhwas surat",
          "ingredients": [
            "White Sesame Seeds – Rich in calcium, iron, and antioxidants",
            "Pumpkin Seeds – Great source of protein, magnesium, and zinc",
            "Watermelon Seeds – Loaded with protein, iron, and magnesium",
            "Sunflower Seeds – High in vitamin E and healthy fats",
            "Black Sesame Seeds – Packed with calcium and antioxidants",
            "Flax Seeds – Excellent source of omega-3 and fiber"
          ],
          "variantTypes": ["Regular", "Lime"]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES
        (v_product_id, 'seeds-regular-100g', 'Regular', 100, 199, 149, 100),
        (v_product_id, 'seeds-regular-200g', 'Regular', 200, 349, 249, 100),
        (v_product_id, 'seeds-lime-100g',    'Lime',    100, 199, 149, 100),
        (v_product_id, 'seeds-lime-200g',    'Lime',    200, 349, 249, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price,
        sale_price   = EXCLUDED.sale_price,
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 7.3 Seed Coconut Crunch
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Coconut Crunch',
        'coconut-crunch',
        'A delightful fusion of chocolate coated till (sesame seeds), premium toasted coconut flakes, and classic dhanadal — crafted for a rich, crunchy, and indulgent mukhwas experience. A perfect harmony of wholesome sweetness and crisp digestive refreshment.',
        'Mukhwas & Digestive Treats',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_sticker_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_sticker_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_back.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        false,
        true,
        '{
          "benefits": [
            "Rich in wholesome dietary fats from pure coconut and toasted sesame",
            "Natural post-meal digestion support with roasted coriander dhanadal",
            "Naturally satisfying crunch with zero artificial colors or preservatives",
            "A guilt-free sweet digestive treat crafted for the whole family",
            "100% tobacco, supari, and areca nut free"
          ],
          "primaryKeyword": "coconut crunch mukhwas surat",
          "ingredients": [
            "Chocolate Coated Till – Roasted sesame seeds coated in rich chocolate for decadent crunch",
            "Toasted Coconut Flakes – Premium sun-dried coconut for authentic sweetness and crisp texture",
            "Dhanadal – Classic roasted coriander seeds for traditional digestive refreshment",
            "Fennel & Cardamom – Aromatic herbal notes that naturally cleanse the palate",
            "Rock Salt – Subtle mineral seasoning that elevates the flavors"
          ],
          "variantTypes": ["Original"]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES
        (v_product_id, 'coconut-crunch-100g', 'Original', 100, 199, 149, 100),
        (v_product_id, 'coconut-crunch-200g', 'Original', 200, 349, 249, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price,
        sale_price   = EXCLUDED.sale_price,
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 7.4 Seed Bundles & Combos (Mintara Trio Pack & Family Feast Pack)
DO $$
DECLARE
    v_trio_id uuid;
    v_family_id uuid;
BEGIN
    -- Combo 1: Mintara Trio Taster Pack (350g total)
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Mintara Trio Pack',
        'mintara-trio-pack',
        'The complete Mintara experience in one bundle. Includes our three signature handcrafted blends: Paan Mukhwas (150g), Seeds Fusion (100g), and Coconut Crunch (100g). 100% supari-free, tobacco-free, and preservative-free.',
        'Combos & Gift Packs',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/combos/mintara-trio-pack.webp",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "is_combo": true,
          "benefits": [
            "Taste all 3 signature Mintara flavours in one box",
            "Includes Paan Mukhwas (150g), Seeds Fusion (100g) & Coconut Crunch (100g)",
            "100% free of supari (areca nut), tobacco, and artificial chemicals",
            "Special bundle savings vs purchasing individually",
            "FSSAI Registered Indian Brand (Reg. No. 20726031000436)"
          ],
          "primaryKeyword": "mukhwas combo pack online",
          "bundleItems": [
            { "name": "Paan Mukhwas", "weight": "150g", "storage": "Refrigerate on arrival" },
            { "name": "Seeds Fusion", "weight": "100g", "storage": "Room temperature" },
            { "name": "Coconut Crunch", "weight": "100g", "storage": "Room temperature" }
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_trio_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_trio_id, 'combo-trio-350g', 'Signature Trio', 350, 597, 399, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;

    -- Combo 2: Family Feast Pack (700g total - Unlocks Free Delivery)
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        images,
        requires_refrigeration,
        is_active,
        metadata
    ) VALUES (
        'Family Feast Pack (Free Delivery)',
        'family-feast-pack',
        'Our largest sharing bundle designed for the whole family. Includes full-size packs of Paan Mukhwas (300g), Seeds Fusion (200g), and Coconut Crunch (200g). Automatically unlocks FREE Pan-India express delivery!',
        'Combos & Gift Packs',
        '[
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/combos/mintara-family-feast-pack.webp",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/paan-mukhwas/pm_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/seeds-fusion/sf_standup_front.png",
            "https://vhmoouvyfvcgblyvyjvo.supabase.co/storage/v1/object/public/mintarabites/coconut-crunch/cc_standup_front.png"
        ]'::jsonb,
        true,
        true,
        '{
          "is_combo": true,
          "benefits": [
            "Includes FREE Pan-India Express Delivery (Orders ₹699+)",
            "Generous family-sized packs: 300g Paan + 200g Seeds + 200g Coconut",
            "Total 700g of artisanal, 100% supari-free after-meal mukhwas",
            "Massive savings of over ₹290 compared to single MRP",
            "FSSAI Registered Indian Brand (Reg. No. 20726031000436)"
          ],
          "primaryKeyword": "family mukhwas gift pack free shipping",
          "bundleItems": [
            { "name": "Paan Mukhwas", "weight": "300g", "storage": "Refrigerate on arrival" },
            { "name": "Seeds Fusion", "weight": "200g", "storage": "Room temperature" },
            { "name": "Coconut Crunch", "weight": "200g", "storage": "Room temperature" }
          ]
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE 
    SET 
        name                   = EXCLUDED.name,
        description            = EXCLUDED.description,
        images                 = EXCLUDED.images,
        category               = EXCLUDED.category,
        requires_refrigeration = EXCLUDED.requires_refrigeration,
        is_active              = EXCLUDED.is_active,
        metadata               = EXCLUDED.metadata
    RETURNING id INTO v_family_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES 
        (v_family_id, 'combo-family-700g', 'Family Trio (Large)', 700, 997, 699, 100)
    ON CONFLICT (sku) DO UPDATE 
    SET 
        product_id   = EXCLUDED.product_id,
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price, 
        sale_price   = EXCLUDED.sale_price, 
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 7.5 Seed Test Product ₹2 (For checkout and sandbox validation)
DO $$
DECLARE
    v_product_id uuid;
BEGIN
    INSERT INTO public.products (
        name,
        slug,
        description,
        category,
        requires_refrigeration,
        images,
        metadata,
        is_active
    ) VALUES (
        'Test Product 2 RS',
        'test-product-2-rs',
        'A ₹2 product for testing checkout and payment flows in production or sandbox.',
        'Test',
        false,
        '[ "/products/placeholder.webp" ]'::jsonb,
        '{ "isTest": true }'::jsonb,
        true
    )
    ON CONFLICT (slug) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        category    = EXCLUDED.category,
        images      = EXCLUDED.images,
        metadata    = EXCLUDED.metadata,
        is_active   = EXCLUDED.is_active
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_variants (product_id, sku, flavor, weight_grams, price, sale_price, stock_qty)
    VALUES (v_product_id, 'test-2rs-100g', 'Test', 100, 2, 2, 1000)
    ON CONFLICT (sku) DO UPDATE SET
        flavor       = EXCLUDED.flavor,
        weight_grams = EXCLUDED.weight_grams,
        price        = EXCLUDED.price,
        sale_price   = EXCLUDED.sale_price,
        stock_qty    = EXCLUDED.stock_qty;
END $$;

-- 7.6 Seed Promotional Discount Codes
INSERT INTO public.promo_codes (
    code,
    type,
    value,
    min_subtotal,
    max_discount,
    expires_at,
    usage_limit,
    used
) VALUES
    ('MINFREE',    'free_delivery', 0,   0,   NULL, NULL,                     NULL, 0),
    ('WELCOME10',  'percent',       10,  199, 100,  NOW() + INTERVAL '1 year', 1000, 0),
    ('MINTARA50',  'flat',          50,  299, 50,   NOW() + INTERVAL '1 year', 500,  0),
    ('FREESHIP',   'free_delivery', 0,   199, NULL, NOW() + INTERVAL '1 year', 1000, 0),
    ('FESTIVE20',  'percent',       20,  499, 200,  NOW() + INTERVAL '1 year', 500,  0)
ON CONFLICT (code) DO UPDATE SET
    type         = EXCLUDED.type,
    value        = EXCLUDED.value,
    min_subtotal = EXCLUDED.min_subtotal,
    max_discount = EXCLUDED.max_discount,
    expires_at   = EXCLUDED.expires_at,
    usage_limit  = EXCLUDED.usage_limit;

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL
-- ------------------------------------------------------------------------------

-- Enable RLS across all application tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- 8.1 Public Read Policies (for storefront catalog & social proof)
DROP POLICY IF EXISTS "Public products are viewable by everyone" ON public.products;
CREATE POLICY "Public products are viewable by everyone" 
  ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public product variants are viewable by everyone" ON public.product_variants;
CREATE POLICY "Public product variants are viewable by everyone" 
  ON public.product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Public reviews are viewable by everyone" 
  ON public.reviews FOR SELECT USING (true);

-- 8.2 Abandoned Cart Recovery Access Policies
DROP POLICY IF EXISTS "Service role full access on abandoned_cart_logs" ON public.abandoned_cart_logs;
CREATE POLICY "Service role full access on abandoned_cart_logs" 
  ON public.abandoned_cart_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view their own recovery logs" ON public.abandoned_cart_logs;
CREATE POLICY "Customers can view their own recovery logs" 
  ON public.abandoned_cart_logs FOR SELECT TO authenticated USING (customer_id = auth.uid());

-- 8.3 Service Role Full Access across Platform Tables
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

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'service_role_manage_company_settings') THEN
    CREATE POLICY service_role_manage_company_settings ON public.company_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8.4 Service Role Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ------------------------------------------------------------------------------
-- 9. RELOAD POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

