import pg from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@whatsapp-platform/config';
import { assertReadOnlySql } from './safety.js';
import { DatabaseSafetyError } from '@whatsapp-platform/shared';

const { Pool } = pg;

let ecommerceSupabaseClient: SupabaseClient | null = null;
let ecommerceRoPool: pg.Pool | null = null;

/**
 * Initializes a Supabase client for reading external ecommerce data.
 * Configured with the ecommerce anon key.
 */
export function createEcommerceSupabaseClient(): SupabaseClient {
  if (!ecommerceSupabaseClient) {
    const config = getConfig();
    const apiKey = config.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY || config.ECOMMERCE_SUPABASE_ANON_KEY;
    ecommerceSupabaseClient = createClient(
      config.ECOMMERCE_SUPABASE_URL,
      apiKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
    );
  }
  return ecommerceSupabaseClient;
}

/**
 * Provides a read-only connection pool for direct ecommerce SQL queries if configured.
 * Every query executed through this pool is validated by assertReadOnlySql().
 */
export function getEcommerceReadOnlyPool(): pg.Pool {
  if (!ecommerceRoPool) {
    const config = getConfig();
    if (!config.ECOMMERCE_DATABASE_URL_RO) {
      throw new DatabaseSafetyError(
        'ECOMMERCE_DATABASE_URL_RO is not configured for direct read-only SQL queries',
      );
    }

    ecommerceRoPool = new Pool({
      connectionString: config.ECOMMERCE_DATABASE_URL_RO,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  return ecommerceRoPool;
}

/**
 * Executes a strictly read-only query against the ecommerce database.
 */
export async function executeEcommerceReadOnlyQuery<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertReadOnlySql(sql);

  const pool = getEcommerceReadOnlyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function closeEcommerceDbPool(): Promise<void> {
  if (ecommerceRoPool) {
    await ecommerceRoPool.end();
    ecommerceRoPool = null;
  }
}

