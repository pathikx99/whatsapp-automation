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
    process.env.ADMIN_API_KEY = 'MintaraBites@010101';
    process.env.SUPABASE_URL = 'https://platform-test.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-platform-secret-key';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-platform-publishable-key';
    process.env.ECOMMERCE_SUPABASE_URL = 'https://ecommerce-test.supabase.co';
    process.env.ECOMMERCE_SUPABASE_ANON_KEY = 'test-ecommerce-anon-key';

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

  it('GET /dashboard should redirect to /dashboard/support', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/dashboard/support');
  });

  it('GET /dashboard/support should return clean HTML without exposed default credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/support',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // Ensure the hardcoded credential hint is NOT leaked in the DOM
    expect(response.body).not.toContain('default: MintaraBites@010101');
    expect(response.body).not.toContain('Default password is <code>MintaraBites@010101</code>');
    // Ensure responsive and mobile view classes exist
    expect(response.body).toContain('btn-back-to-inbox');
    expect(response.body).toContain('btn-toggle-dossier');
    expect(response.body).toContain('mobile-tablet-header');
    expect(response.body).toContain('quick-replies-bar');
    expect(response.body).toContain('❄️ Refrigeration FAQ');
  });

  it('POST /api/support/auth/verify should reject unauthorized keys and rate-limit repeated brute force attempts', async () => {
    const fakeIp = '198.51.100.42';

    // Attempt with invalid password
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/support/auth/verify',
      remoteAddress: fakeIp,
      payload: { key: 'WrongPasswordXYZ' },
    });
    expect(invalidRes.statusCode).toBe(401);

    // Exhaust remaining attempts (10 attempts total allowed)
    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/support/auth/verify',
        remoteAddress: fakeIp,
        payload: { key: `BruteForceAttempt${i}` },
      });
    }

    // 11th attempt should trigger 429 Too Many Requests
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/api/support/auth/verify',
      remoteAddress: fakeIp,
      payload: { key: 'MintaraBites@010101' },
    });
    expect(rateLimitedRes.statusCode).toBe(429);
    expect(JSON.parse(rateLimitedRes.body).error).toContain('Too many failed authentication attempts');

    // Different IP should still authenticate normally
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/support/auth/verify',
      remoteAddress: '198.51.100.99',
      payload: { key: 'MintaraBites@010101' },
    });
    expect(validRes.statusCode).toBe(200);
    expect(JSON.parse(validRes.body).valid).toBe(true);
  });

  it('GET unmatched routes should return branded HTML for browser requests and JSON for API requests', async () => {
    const html404 = await app.inject({
      method: 'GET',
      url: '/non-existent-page',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(html404.statusCode).toBe(404);
    expect(html404.headers['content-type']).toContain('text/html');
    expect(html404.body).toContain('Page Not Found');
    expect(html404.body).toContain('/dashboard/support');

    const json404 = await app.inject({
      method: 'GET',
      url: '/api/non-existent-endpoint',
      headers: { accept: 'application/json' },
    });
    expect(json404.statusCode).toBe(404);
    expect(JSON.parse(json404.body).error).toBe('Not Found');
  });

  it('GET /dashboard/support should contain command center export, agent notes, and new chat elements', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/support',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('btn-export-chat');
    expect(response.body).toContain('Agent Internal Notes');
    expect(response.body).toContain('exportChatTranscript');
    expect(response.body).toContain('btn-open-new-chat');
    expect(response.body).toContain('new-chat-modal');
  });

  it('POST /api/support/conversations should allow starting or opening a chat with any number', async () => {
    // 1. Rejects unauthorized
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/support/conversations',
      payload: { phoneNumber: '8732993344' },
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Accepts authorized request, normalizes 10-digit phone to 91...
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/support/conversations',
      headers: { 'x-admin-key': 'MintaraBites@010101' },
      payload: {
        phoneNumber: '8732993344',
        customerName: 'Pathik Patel',
      },
    });
    expect(authRes.statusCode).toBe(200);
    const body = JSON.parse(authRes.body);
    expect(body.status).toBe('ok');
    expect(body.conversation).toBeDefined();
    expect(body.conversation.phoneNumber).toBe('918732993344');
    expect(body.conversation.customerName).toBe('Pathik Patel');
  });

  it('Administrative endpoints should reject unauthenticated requests with 401', async () => {
    const endpoints = [
      { method: 'GET' as const, url: '/api/marketing/rfm-segments' },
      { method: 'GET' as const, url: '/api/analytics/d2c-performance' },
      { method: 'GET' as const, url: '/api/analytics/overview' },
      { method: 'GET' as const, url: '/api/analytics/roas' },
      { method: 'GET' as const, url: '/api/logistics/ndr' },
      { method: 'POST' as const, url: '/api/support/conversations' },
      { method: 'PATCH' as const, url: '/api/support/conversations/00000000-0000-0000-0000-000000000000/notes' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toContain('Unauthorized');
    }
  });
});
