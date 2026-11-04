import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Attempt to load .env from workspace root if available
const rootEnvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config(); // fallback to default dotenv resolution
}

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
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),

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
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  LOG_PRETTY: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),

  // Local Supabase (Required for platform state and migrations)
  LOCAL_SUPABASE_URL: z.string().url('LOCAL_SUPABASE_URL must be a valid URL'),
  LOCAL_SUPABASE_ANON_KEY: z.string().min(1, 'LOCAL_SUPABASE_ANON_KEY is required'),
  LOCAL_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LOCAL_DATABASE_URL: z
    .string()
    .min(1, 'LOCAL_DATABASE_URL is required')
    .refine((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
      } catch {
        return false;
      }
    }, 'LOCAL_DATABASE_URL must be a valid PostgreSQL connection URI'),

  // Existing Ecommerce Supabase (Read-Only access, separate environment)
  ECOMMERCE_SUPABASE_URL: z.string().url('ECOMMERCE_SUPABASE_URL must be a valid URL'),
  ECOMMERCE_SUPABASE_ANON_KEY: z.string().min(1, 'ECOMMERCE_SUPABASE_ANON_KEY is required'),
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

  // Future AI Provider Configuration (Optional at this stage)
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'mock']).default('mock'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),

  // Future WhatsApp Provider Configuration (Optional at this stage)
  WHATSAPP_PROVIDER: z.enum(['cloud_api', 'twilio', 'mock']).default('mock'),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
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
  const result = envSchema.safeParse(raw);

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
