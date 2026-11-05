import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLocalSupabaseClient,
  createEcommerceSupabaseClient,
  resetLocalSupabaseClient,
  resetEcommerceSupabaseClient,
} from '@whatsapp-platform/database';
import { resetConfigCache } from '@whatsapp-platform/config';
import { createEcommerceAdapter } from '@whatsapp-platform/ecommerce-adapter';

describe('Database Configuration Separation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'production';
    process.env.SUPABASE_URL = 'https://platform-test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-platform-secret-key-123';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-platform-pub-key-123';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce-test.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-anon-key-456';
    delete process.env.ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY;

    resetLocalSupabaseClient();
    resetEcommerceSupabaseClient();
    resetConfigCache();
  });

  it('should initialize separate Supabase clients for platform and ecommerce environments', () => {
    const platformClient = createLocalSupabaseClient();
    const ecommerceClient = createEcommerceSupabaseClient();

    const platformInternal = platformClient as unknown as {
      supabaseUrl: string;
      supabaseKey: string;
    };
    const ecommerceInternal = ecommerceClient as unknown as {
      supabaseUrl: string;
      supabaseKey: string;
    };

    // Verify platform and ecommerce clients point to separate URLs and keys
    expect(platformInternal.supabaseUrl).toBe('https://platform-test.supabase.co');
    expect(ecommerceInternal.supabaseUrl).toBe('https://ecommerce-test.supabase.co');
    expect(platformInternal.supabaseKey).toBe('test-platform-secret-key-123');
    expect(ecommerceInternal.supabaseKey).toBe('test-ecommerce-anon-key-456');
  });

  it('should verify ecommerce adapter connects through the isolated ecommerce client', () => {
    const adapter = createEcommerceAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });
});
