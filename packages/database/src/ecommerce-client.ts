import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@whatsapp-platform/config';

let ecommerceSupabaseClient: SupabaseClient | null = null;

/**
 * Initializes a Supabase client for reading external ecommerce data.
 * Configured with the ecommerce anon key.
 */
export function createEcommerceSupabaseClient(): SupabaseClient {
  if (!ecommerceSupabaseClient) {
    const config = getConfig();
    const apiKey = config.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY || config.ECOMMERCE_SUPABASE_ANON_KEY;
    ecommerceSupabaseClient = createClient(config.ECOMMERCE_SUPABASE_URL, apiKey, {
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
    });
  }
  return ecommerceSupabaseClient;
}

export function resetEcommerceSupabaseClient(): void {
  ecommerceSupabaseClient = null;
}
