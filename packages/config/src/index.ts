import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Search upwards for project root directory
export function findRootDir(): string {
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (
      fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, '.env.dev')) ||
      fs.existsSync(path.join(currentDir, '.env.prod')) ||
      fs.existsSync(path.join(currentDir, '.env'))
    ) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return process.cwd();
}

/**
 * Loads environment variables with automatic environment resolution:
 * 1. Explicit file via ENV_FILE (e.g. ENV_FILE=.env.prod)
 * 2. Targeted environment (.env.prod for production, .env.dev for development)
 * 3. Default active .env file
 * 4. Local machine overrides (.env.local)
 */
export function loadEnvironment(): void {
  const rootDir = findRootDir();
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  // 1. Explicit override via ENV_FILE
  if (process.env.ENV_FILE) {
    const customPath = path.resolve(rootDir, process.env.ENV_FILE);
    if (fs.existsSync(customPath)) {
      dotenv.config({ path: customPath, override: true });
      if (isTest) process.env.NODE_ENV = 'test';
      return;
    }
  }

  // 2. Active / base .env file
  const baseEnvPath = path.join(rootDir, '.env');
  if (fs.existsSync(baseEnvPath)) {
    dotenv.config({ path: baseEnvPath });
  }

  // 3. Preferred environment file based on APP_ENV or NODE_ENV
  const isProd = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  const targetEnvFile = isProd ? '.env.prod' : '.env.dev';
  const targetEnvPath = path.join(rootDir, targetEnvFile);

  if (fs.existsSync(targetEnvPath)) {
    dotenv.config({ path: targetEnvPath, override: true });
  }

  // 4. Local developer overrides
  const localEnvPath = path.join(rootDir, '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true });
  }

  if (isTest) {
    process.env.NODE_ENV = 'test';
  }
}

loadEnvironment();

const SECRET_KEY_PATTERNS = [/key/i, /secret/i, /password/i, /token/i, /url/i, /credential/i];

export function isSecretField(fieldName: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(fieldName));
}

export function maskSecret(val?: string | null): string {
  if (!val) return '<empty>';
  if (val.length <= 6) return '******';
  return `${val.substring(0, 3)}...${val.substring(val.length - 3)}`;
}

export const envSchema = z.object({
  // Application environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),

  // API Server
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) =>
      val
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),

  // Platform Supabase Database (Single Source of Truth)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY is required'),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),

  // Optional backwards-compatibility aliases
  LOCAL_SUPABASE_URL: z.string().url().optional(),
  LOCAL_SUPABASE_ANON_KEY: z.string().optional(),
  LOCAL_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LOCAL_DATABASE_URL: z.string().optional(),

  // Existing Ecommerce Supabase (Read-Only access, separate environment)
  ECOMMERCE_SUPABASE_URL: z.string().url('ECOMMERCE_SUPABASE_URL must be a valid URL'),
  ECOMMERCE_SUPABASE_ANON_KEY: z.string().min(1, 'ECOMMERCE_SUPABASE_ANON_KEY is required'),
  ECOMMERCE_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ECOMMERCE_DATABASE_URL_RO: z
    .string()
    .optional()
    .refine((url) => {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
      } catch {
        return false;
      }
    }, 'ECOMMERCE_DATABASE_URL_RO must be a valid PostgreSQL connection URI if provided'),

  // AI Provider Configuration
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'mock']).default('mock'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),

  // WhatsApp Provider Configuration
  WHATSAPP_PROVIDER: z.enum(['cloud_api', 'twilio', 'mock']).default('mock'),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CATALOG_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

  // Integrations & Alerts
  ECOMMERCE_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_ALERT_PHONE_NUMBER: z.string().optional(),
});

export type RawConfig = z.input<typeof envSchema>;
export type AppConfig = z.infer<typeof envSchema>;

export class ConfigurationError extends Error {
  public readonly issues: Array<{ field: string; message: string }>;

  constructor(issues: Array<{ field: string; message: string }>) {
    const formatted = issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n');
    super(`Configuration validation failed:\n${formatted}`);
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export function validateConfig(raw: Record<string, unknown> = process.env): AppConfig {
  const normalized = { ...raw };
  if (!normalized.API_PORT && normalized.PORT) {
    normalized.API_PORT = normalized.PORT;
  }
  if (!normalized.SUPABASE_URL && normalized.LOCAL_SUPABASE_URL) {
    normalized.SUPABASE_URL = normalized.LOCAL_SUPABASE_URL;
  }
  if (
    !normalized.SUPABASE_SECRET_KEY &&
    (normalized.LOCAL_SUPABASE_SERVICE_ROLE_KEY || normalized.LOCAL_SUPABASE_ANON_KEY)
  ) {
    normalized.SUPABASE_SECRET_KEY = (normalized.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
      normalized.LOCAL_SUPABASE_ANON_KEY) as string;
  }
  if (!normalized.SUPABASE_PUBLISHABLE_KEY && normalized.LOCAL_SUPABASE_ANON_KEY) {
    normalized.SUPABASE_PUBLISHABLE_KEY = normalized.LOCAL_SUPABASE_ANON_KEY as string;
  }

  const result = envSchema.safeParse(normalized);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      return {
        field,
        message: issue.message,
      };
    });

    throw new ConfigurationError(issues);
  }

  return result.data;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(override?: Record<string, unknown>): AppConfig {
  if (override) {
    return validateConfig(override);
  }
  if (!cachedConfig) {
    cachedConfig = validateConfig();
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function getPlatformSupabaseConfig(config: AppConfig = getConfig()): {
  url: string;
  publishableKey?: string;
  secretKey: string;
} {
  const url = config.SUPABASE_URL;
  const secretKey = config.SUPABASE_SECRET_KEY;
  const publishableKey = config.SUPABASE_PUBLISHABLE_KEY;
  return { url, publishableKey, secretKey };
}

export * from './business-profile.js';
