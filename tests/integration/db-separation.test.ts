import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLocalSupabaseClient,
  createEcommerceSupabaseClient,
} from '@whatsapp-platform/database';
import { resetConfigCache } from '@whatsapp-platform/config';
import { createEcommerceAdapter } from '@whatsapp-platform/ecommerce-adapter';

describe('Database Configuration Separation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'local';
    process.env.LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.LOCAL_SUPABASE_ANON_KEY = 'local-dummy-anon-key';
    process.env.LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://remote-ecommerce.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'remote-ecommerce-anon-key';
    delete process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;
    resetConfigCache();
  });

  it('should initialize separate Supabase clients for local and remote environments', () => {
    const localClient = createLocalSupabaseClient();
    const ecommerceClient = createEcommerceSupabaseClient();

    const localInternal = localClient as unknown as { supabaseUrl: string; supabaseKey: string };
    const ecommerceInternal = ecommerceClient as unknown as {
      supabaseUrl: string;
      supabaseKey: string;
    };

    // Verify local and remote clients point to separate URLs
    expect(localInternal.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(ecommerceInternal.supabaseUrl).toBe('https://remote-ecommerce.supabase.co');
    expect(localInternal.supabaseKey).toBe('local-dummy-anon-key');
    expect(ecommerceInternal.supabaseKey).toBe('remote-ecommerce-anon-key');
  });

  it('should verify ecommerce adapter connects through the isolated ecommerce client', () => {
    const adapter = createEcommerceAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });
});
