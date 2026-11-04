-- Migration: 20261105000000_platform_schemas.sql
-- Description: Initialize isolated platform schemas (integration, marketing, support, messaging)
-- Reversible: DROP SCHEMA IF EXISTS <schema_name> CASCADE;

-- 1. Integration schema: handles connectors to ecommerce platforms, syncing, and webhook events
CREATE SCHEMA IF NOT EXISTS integration;
COMMENT ON SCHEMA integration IS 'Isolated schema for ecommerce connectors, external synchronization, and ingestion';

-- 2. Marketing schema: handles campaigns, broadcasts, audience segmentation, and templates
CREATE SCHEMA IF NOT EXISTS marketing;
COMMENT ON SCHEMA marketing IS 'Isolated schema for marketing campaigns, audience segments, and message dispatching';

-- 3. Support schema: handles AI customer conversations, ticket escalation, context, and memory
CREATE SCHEMA IF NOT EXISTS support;
COMMENT ON SCHEMA support IS 'Isolated schema for AI customer support, conversation threads, and agent assistance';

-- 4. Messaging schema: handles WhatsApp delivery status, provider message logs, and inbound/outbound queues
CREATE SCHEMA IF NOT EXISTS messaging;
COMMENT ON SCHEMA messaging IS 'Isolated schema for WhatsApp gateway messaging, webhook logs, and dispatch states';

-- Permissions: Grant schema usage to administrative and backend service roles
DO $$
BEGIN
  -- Grant to postgres superuser
  GRANT USAGE, CREATE ON SCHEMA integration TO postgres;
  GRANT USAGE, CREATE ON SCHEMA marketing TO postgres;
  GRANT USAGE, CREATE ON SCHEMA support TO postgres;
  GRANT USAGE, CREATE ON SCHEMA messaging TO postgres;

  -- Grant to service_role (backend application runtime)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE, CREATE ON SCHEMA integration TO service_role;
    GRANT USAGE, CREATE ON SCHEMA marketing TO service_role;
    GRANT USAGE, CREATE ON SCHEMA support TO service_role;
    GRANT USAGE, CREATE ON SCHEMA messaging TO service_role;
  END IF;

  -- Restrict anon and authenticated users from accessing internal schemas by default
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA integration FROM anon;
    REVOKE ALL ON SCHEMA marketing FROM anon;
    REVOKE ALL ON SCHEMA support FROM anon;
    REVOKE ALL ON SCHEMA messaging FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA integration FROM authenticated;
    REVOKE ALL ON SCHEMA marketing FROM authenticated;
    REVOKE ALL ON SCHEMA support FROM authenticated;
    REVOKE ALL ON SCHEMA messaging FROM authenticated;
  END IF;
END $$;
