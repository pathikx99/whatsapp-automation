import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '../../packages/config/src/index.js';

describe('API Readiness Endpoint', () => {
  let appSuccess: FastifyInstance;
  let appFailure: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'local';
    process.env.API_PORT = '3000';
    process.env.LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.LOCAL_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.LOCAL_DATABASE_URL = 'postgresql://postgres:secretpassword@127.0.0.1:54322/postgres';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-key';

    resetConfigCache();

    // App with mock healthy DB
    appSuccess = await buildServer({
      disableRequestLogging: true,
      dbHealthChecker: async () => ({
        status: 'healthy',
        latencyMs: 5,
        database: 'postgres',
      }),
    });
    await appSuccess.ready();

    // App with mock failing DB
    appFailure = await buildServer({
      disableRequestLogging: true,
      dbHealthChecker: async () => {
        throw new Error('Connection refused at 127.0.0.1:54322 with password secretpassword');
      },
    });
    await appFailure.ready();
  });

  afterAll(async () => {
    await appSuccess.close();
    await appFailure.close();
  });

  it('GET /ready should return 200 OK when database is connected', async () => {
    const response = await appSuccess.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ready');
    expect(body.checks.configuration).toBe('ok');
    expect(body.checks.database).toBe('healthy');
    expect(typeof body.checks.latencyMs).toBe('number');
  });

  it('GET /ready should return 503 degraded when database connectivity fails', async () => {
    const response = await appFailure.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.database).toBe('disconnected');
    expect(body.error).toBe('Local database connectivity check failed');

    // CRITICAL: Ensure no sensitive details (e.g. secretpassword, ports, connection string) are leaked in body
    expect(response.body).not.toContain('secretpassword');
    expect(response.body).not.toContain('54322');
  });
});
