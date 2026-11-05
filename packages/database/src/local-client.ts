import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@whatsapp-platform/config';

let platformSupabaseClient: SupabaseClient | null = null;

export interface DbHealthResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  database: string;
}

/**
 * Initializes and returns the Supabase client for the platform database.
 * Uses SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
export function createPlatformSupabaseClient(): SupabaseClient {
  if (!platformSupabaseClient) {
    const config = getConfig();
    const url = config.SUPABASE_URL || config.LOCAL_SUPABASE_URL!;
    const apiKey =
      config.SUPABASE_SECRET_KEY ||
      config.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
      config.SUPABASE_PUBLISHABLE_KEY ||
      config.LOCAL_SUPABASE_ANON_KEY!;

    platformSupabaseClient = createClient(url, apiKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return platformSupabaseClient;
}

// Backwards-compatibility alias
export const createLocalSupabaseClient = createPlatformSupabaseClient;

export function resetPlatformSupabaseClient(): void {
  platformSupabaseClient = null;
}

export const resetLocalSupabaseClient = resetPlatformSupabaseClient;

/**
 * Graceful shutdown helper.
 * No-op: Supabase client uses HTTP stateless connections; no local connection pool to close.
 */
export async function closeLocalDbPool(): Promise<void> {
  // No local DB pool needed when using Supabase
}

export const closePlatformDb = closeLocalDbPool;

/**
 * Checks connectivity to the Supabase platform database via its REST endpoint.
 */
export async function checkPlatformDbHealth(): Promise<DbHealthResult> {
  const startTime = Date.now();
  const config = getConfig();
  const url = config.SUPABASE_URL || config.LOCAL_SUPABASE_URL!;
  const apiKey =
    config.SUPABASE_SECRET_KEY ||
    config.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
    config.SUPABASE_PUBLISHABLE_KEY ||
    config.LOCAL_SUPABASE_ANON_KEY!;

  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok && res.status !== 404 && res.status !== 200) {
    throw new Error(`Platform database check failed with HTTP ${res.status}`);
  }

  return {
    status: 'healthy',
    latencyMs: Date.now() - startTime,
    database: 'supabase',
  };
}

export const checkLocalDbHealth = checkPlatformDbHealth;
