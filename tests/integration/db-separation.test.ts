import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLocalSupabaseClient,
  createEcommerceSupabaseClient,
} from '../../packages/database/src/index.js';
import { resetConfigCache } from '../../packages/config/src/index.js';
import { createEcommerceAdapter } from '../../packages/ecommerce-adapter/src/index.js';

describe('Database Configuration Separation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'local';
    process.env.LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.LOCAL_SUPABASE_ANON_KEY = 'local-dummy-anon-key';
    process.env.LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://remote-ecommerce.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'remote-ecommerce-anon-key';
    resetConfigCache();
  });

  it('should initialize separate Supabase clients for local and remote environments', () => {
    const localClient = createLocalSupabaseClient();
    const ecommerceClient = createEcommerceSupabaseClient();

    // Verify local and remote clients point to separate URLs
    expect((localClient as any).supabaseUrl).toBe('http://127.0.0.1:54321');
    expect((ecommerceClient as any).supabaseUrl).toBe('https://remote-ecommerce.supabase.co');
    expect((localClient as any).supabaseKey).toBe('local-dummy-anon-key');
    expect((ecommerceClient as any).supabaseKey).toBe('remote-ecommerce-anon-key');
  });

  it('should verify ecommerce adapter connects through the isolated ecommerce client', () => {
    const adapter = createEcommerceAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });
});
