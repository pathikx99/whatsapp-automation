import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';

describe('API Health Endpoint (Liveness)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_ENV = 'local';
    process.env.API_PORT = '3000';
    process.env.LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.LOCAL_SUPABASE_ANON_KEY = 'test-key';
    process.env.LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-key';

    resetConfigCache();
    app = await buildServer({ disableRequestLogging: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return 200 OK and service status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.service).toBe('whatsapp-platform-api');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /health should include basic security headers from helmet', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
