import pg from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@whatsapp-platform/config';
import { assertLocalDatabaseUrl } from './safety.js';

const { Pool } = pg;

let localPool: pg.Pool | null = null;
let localSupabaseClient: SupabaseClient | null = null;

export interface DbHealthResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  database: string;
}

export function getLocalDbPool(): pg.Pool {
  if (!localPool) {
    const config = getConfig();
    // Safety check: local database URL must point to local host
    assertLocalDatabaseUrl(config.LOCAL_DATABASE_URL, 'local database pool initialization');

    localPool = new Pool({
      connectionString: config.LOCAL_DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    localPool.on('error', (err) => {
      // Don't crash process on idle client error; log will capture via handler
      console.error('[DATABASE_LOCAL_POOL_ERROR]', err.message);
    });
  }

  return localPool;
}

export async function closeLocalDbPool(): Promise<void> {
  if (localPool) {
    await localPool.end();
    localPool = null;
  }
}

export function createLocalSupabaseClient(): SupabaseClient {
  if (!localSupabaseClient) {
    const config = getConfig();
    localSupabaseClient = createClient(config.LOCAL_SUPABASE_URL, config.LOCAL_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return localSupabaseClient;
}

/**
 * Checks connectivity to the local database without leaking connection strings or credentials.
 */
export async function checkLocalDbHealth(pool?: pg.Pool): Promise<DbHealthResult> {
  const activePool = pool || getLocalDbPool();
  const startTime = Date.now();

  const client = await activePool.connect();
  try {
    const res = await client.query('SELECT current_database() as db_name, 1 as healthy;');
    const latencyMs = Date.now() - startTime;
    const dbName = res.rows[0]?.db_name || 'local';

    return {
      status: 'healthy',
      latencyMs,
      database: dbName,
    };
  } finally {
    client.release();
  }
}
