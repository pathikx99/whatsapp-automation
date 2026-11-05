import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  ConfigurationError,
  isSecretField,
  maskSecret,
} from '@whatsapp-platform/config';

describe('Environment Configuration Validation', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    APP_ENV: 'local',
    API_PORT: '3000',
    API_HOST: '127.0.0.1',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    LOG_LEVEL: 'info',
    LOG_PRETTY: 'false',
    SUPABASE_URL: 'https://platform-project.supabase.co',
    SUPABASE_SECRET_KEY: 'test-platform-secret-key',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    ECOMMERCE_SUPABASE_URL: 'https://ecommerce-project.supabase.co',
    ECOMMERCE_SUPABASE_ANON_KEY: 'test-ecommerce-anon-key',
  };

  it('should validate a valid configuration and transform values', () => {
    const config = validateConfig(validBaseEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.API_PORT).toBe(3000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(config.AI_PROVIDER).toBe('mock');
    expect(config.WHATSAPP_PROVIDER).toBe('mock');
    expect(config.SUPABASE_URL).toBe('https://platform-project.supabase.co');
    expect(config.SUPABASE_SECRET_KEY).toBe('test-platform-secret-key');
  });

  it('should fail with ConfigurationError when required fields are missing', () => {
    const invalidEnv = { ...validBaseEnv };
    delete (invalidEnv as Record<string, unknown>).SUPABASE_SECRET_KEY;

    expect(() => validateConfig(invalidEnv)).toThrow(ConfigurationError);
  });

  it('should fail safely when SUPABASE_URL is not a valid URL', () => {
    const invalidEnv = {
      ...validBaseEnv,
      SUPABASE_URL: 'not-a-valid-url',
    };

    expect(() => validateConfig(invalidEnv)).toThrow(ConfigurationError);
  });

  it('should allow optional AI and WhatsApp credentials to be absent without failure', () => {
    const config = validateConfig({
      ...validBaseEnv,
      AI_PROVIDER: 'mock',
      WHATSAPP_PROVIDER: 'mock',
    });

    expect(config.AI_API_KEY).toBeUndefined();
    expect(config.WHATSAPP_API_KEY).toBeUndefined();
  });

  it('should correctly identify secret fields and mask secrets', () => {
    expect(isSecretField('SUPABASE_SECRET_KEY')).toBe(true);
    expect(isSecretField('WHATSAPP_API_KEY')).toBe(true);
    expect(isSecretField('API_PORT')).toBe(false);

    expect(maskSecret('secret123456')).toBe('sec...456');
    expect(maskSecret('short')).toBe('******');
    expect(maskSecret(null)).toBe('<empty>');
  });
});
