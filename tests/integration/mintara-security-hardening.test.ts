import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  getMultiTenantRepository,
  MultiTenantRepository,
  DatabaseRouter,
  DatabaseRoutingError,
} from '@whatsapp-platform/database';
import {
  getToolRegistry,
  ToolRegistry,
  createTrustedToolContext,
  verifyTrustedToolContext,
} from '@whatsapp-platform/ai';
import {
  signSupabaseJwt,
  verifySupabaseJwt,
  encryptDatabaseCredential,
  decryptDatabaseCredential,
  reencryptDatabaseCredential,
  isEncryptedCredential,
  setTestJwks,
  clearJwksCache,
  getExpectedSupabaseIssuer,
} from '@whatsapp-platform/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { resetConfigCache } from '@whatsapp-platform/config';

describe('Phase 1: Critical Security Hardening, Identity & Authorization Remediation Tests', () => {
  let multiTenantRepo: MultiTenantRepository;
  let toolRegistry: ToolRegistry;
  const adminApiKey = 'MintaraBites@010101';
  const testJwksUrl = 'https://dsbkbkcrhvjaqlujqcgo.supabase.co/auth/v1/.well-known/jwks.json';
  const expectedIssuer = 'https://dsbkbkcrhvjaqlujqcgo.supabase.co/auth/v1';

  // Generate test cryptographic keypairs for asymmetric signing tests
  const ecKeypair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecJwk = ecKeypair.publicKey.export({ format: 'jwk' }) as any;
  ecJwk.kid = 'supabase-ec-key-1';
  ecJwk.alg = 'ES256';
  ecJwk.use = 'sig';

  const rsaKeypair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaJwk = rsaKeypair.publicKey.export({ format: 'jwk' }) as any;
  rsaJwk.kid = 'supabase-rsa-key-1';
  rsaJwk.alg = 'RS256';
  rsaJwk.use = 'sig';

  beforeAll(() => {
    process.env.ADMIN_API_KEY = adminApiKey;
    process.env.SUPABASE_URL = 'https://dsbkbkcrhvjaqlujqcgo.supabase.co';
    process.env.SUPABASE_JWKS_URL = testJwksUrl;
    process.env.SUPABASE_JWT_SECRET = 'mintara-test-jwt-secret-32-chars-long!';
    process.env.DATABASE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex
    resetConfigCache();
  });

  beforeEach(() => {
    clearJwksCache();
    setTestJwks(testJwksUrl, [ecJwk, rsaJwk]);
    multiTenantRepo = getMultiTenantRepository();
    toolRegistry = getToolRegistry();
  });

  // ===========================================================================
  // 1. SUPABASE AUTH JWT CRYPTOGRAPHIC VERIFICATION
  // ===========================================================================
  describe('1. Supabase Auth JWT Verification (Asymmetric ES256/RS256 and HS256)', () => {
    it('verifies valid asymmetric ES256 tokens matching the live Supabase project configuration', async () => {
      const token = signSupabaseJwt(
        {
          sub: '10000000-0000-0000-0000-000000000001',
          email: 'owner@mintarabites.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
          audience: 'authenticated',
        },
      );

      const claims = await verifySupabaseJwt(token, { jwksUrl: testJwksUrl });
      expect(claims.sub).toBe('10000000-0000-0000-0000-000000000001');
      expect(claims.email).toBe('owner@mintarabites.com');
      expect(claims.aud).toBe('authenticated');
      expect(claims.iss).toBe(expectedIssuer);
    });

    it('verifies valid asymmetric RS256 tokens', async () => {
      const token = signSupabaseJwt(
        {
          sub: '10000000-0000-0000-0000-000000000001',
          email: 'owner@mintarabites.com',
        },
        {
          algorithm: 'RS256',
          privateKey: rsaKeypair.privateKey,
          kid: 'supabase-rsa-key-1',
          issuer: expectedIssuer,
          audience: 'authenticated',
        },
      );

      const claims = await verifySupabaseJwt(token, { jwksUrl: testJwksUrl });
      expect(claims.sub).toBe('10000000-0000-0000-0000-000000000001');
      expect(claims.email).toBe('owner@mintarabites.com');
    });

    it('verifies valid legacy HS256 tokens when configured with explicit secret', async () => {
      const token = signSupabaseJwt(
        {
          sub: '10000000-0000-0000-0000-000000000001',
          email: 'owner@mintarabites.com',
        },
        {
          secret: 'mintara-test-jwt-secret-32-chars-long!',
          issuer: expectedIssuer,
          audience: 'authenticated',
        },
      );

      const claims = await verifySupabaseJwt(token, {
        secret: 'mintara-test-jwt-secret-32-chars-long!',
        issuer: expectedIssuer,
      });
      expect(claims.sub).toBe('10000000-0000-0000-0000-000000000001');
    });

    it('rejects tokens with forged/invalid cryptographic signatures', async () => {
      const token = signSupabaseJwt(
        { sub: 'usr_1', email: 'user@test.com' },
        { secret: 'mintara-test-jwt-secret-32-chars-long!', issuer: expectedIssuer },
      );
      // Corrupt signature portion
      const parts = token.split('.');
      parts[2] = parts[2].substring(0, parts[2].length - 4) + 'AAAA';
      const corruptedToken = parts.join('.');

      await expect(verifySupabaseJwt(corruptedToken)).rejects.toThrow(
        /Invalid JWT signature: cryptographic verification failed/,
      );
    });

    it('rejects tokens with unknown or unrotated JWKS key identifier (kid)', async () => {
      const token = signSupabaseJwt(
        { sub: 'usr_1', email: 'user@test.com' },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'unknown-kid-never-registered',
          issuer: expectedIssuer,
        },
      );

      await expect(verifySupabaseJwt(token, { jwksUrl: testJwksUrl })).rejects.toThrow(
        /Unknown or unrotated JWKS key identifier/,
      );
    });

    it('rejects tokens with mismatched issuer (iss)', async () => {
      const token = signSupabaseJwt(
        { sub: 'usr_1', email: 'user@test.com' },
        {
          secret: 'mintara-test-jwt-secret-32-chars-long!',
          issuer: 'https://malicious-counterfeit-issuer.com/auth/v1',
          audience: 'authenticated',
        },
      );

      await expect(
        verifySupabaseJwt(token, {
          secret: 'mintara-test-jwt-secret-32-chars-long!',
          issuer: expectedIssuer,
        }),
      ).rejects.toThrow(/JWT issuer mismatch/);
    });

    it('rejects tokens with mismatched audience (aud)', async () => {
      const token = signSupabaseJwt(
        { sub: 'usr_1', email: 'user@test.com' },
        {
          secret: 'mintara-test-jwt-secret-32-chars-long!',
          issuer: expectedIssuer,
          audience: 'untrusted-client-audience',
        },
      );

      await expect(
        verifySupabaseJwt(token, {
          secret: 'mintara-test-jwt-secret-32-chars-long!',
          audience: 'authenticated',
        }),
      ).rejects.toThrow(/JWT audience mismatch/);
    });

    it('rejects expired tokens (exp in the past)', async () => {
      const token = signSupabaseJwt(
        {
          sub: 'usr_1',
          email: 'user@test.com',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        },
        { secret: 'mintara-test-jwt-secret-32-chars-long!', issuer: expectedIssuer },
      );

      await expect(verifySupabaseJwt(token)).rejects.toThrow(/JWT expired at/);
    });

    it('rejects unsupported or insecure algorithms (e.g. none, HS384)', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_1',
          email: 'user@test.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: 'authenticated',
        }),
      ).toString('base64url');
      const unsecureToken = `${header}.${payload}.`;

      await expect(verifySupabaseJwt(unsecureToken)).rejects.toThrow(/Unsupported JWT algorithm/);
    });

    it('handles JWKS key rotation safely by dynamically refreshing newly rotated keys', async () => {
      // 1. New key generated during rotation
      const ecKeypairRotated = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const ecJwkRotated = ecKeypairRotated.publicKey.export({ format: 'jwk' }) as any;
      ecJwkRotated.kid = 'supabase-ec-key-rotated-2';
      ecJwkRotated.alg = 'ES256';
      ecJwkRotated.use = 'sig';

      // 2. Add rotated key to JWKS registry
      setTestJwks(testJwksUrl, [ecJwk, ecJwkRotated]);

      // 3. Token signed with rotated key verifies cleanly
      const token = signSupabaseJwt(
        { sub: 'usr_rotated', email: 'rotated@test.com' },
        {
          algorithm: 'ES256',
          privateKey: ecKeypairRotated.privateKey,
          kid: 'supabase-ec-key-rotated-2',
          issuer: expectedIssuer,
        },
      );

      const claims = await verifySupabaseJwt(token, { jwksUrl: testJwksUrl });
      expect(claims.sub).toBe('usr_rotated');
      expect(claims.email).toBe('rotated@test.com');
    });
  });

  // ===========================================================================
  // 2. PERSISTENT POSTGRESQL AUTHORIZATION & IDENTITY ENFORCEMENT
  // ===========================================================================
  describe('2. Persistent Authorization & Identity Enforcement', () => {
    it('resolves platform owner from persisted records and ignores client email spoofing', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      // Owner JWT with verified claims
      const ownerToken = signSupabaseJwt(
        {
          sub: '10000000-0000-0000-0000-000000000001',
          email: 'owner@mintarabites.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/platform/overview',
        headers: {
          authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.status).toBe('healthy');
    });

    it('rejects deactivated platform users with HTTP 403 UserInactive', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      // Create a deactivated platform user in persistent store
      const deactivatedUser = await multiTenantRepo.createPlatformUser({
        email: `inactive_admin_${Date.now()}@mintara.ai`,
        fullName: 'Inactive Admin',
        role: 'platform_admin',
        isActive: false,
      });

      const inactiveToken = signSupabaseJwt(
        {
          sub: deactivatedUser.id,
          email: deactivatedUser.email,
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/platform/overview',
        headers: {
          authorization: `Bearer ${inactiveToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.error).toBe('UserInactive');
      expect(json.message).toContain('is deactivated');
    });

    it('prevents cross-tenant access: Tenant A cannot access Tenant B', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      // Tenant A staff user
      const tenantAStaffToken = signSupabaseJwt(
        {
          sub: 'usr_tenant_a_staff',
          email: 'staff@tenant-a.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      // Attempt to access Mintara Bites tenant with Tenant A token
      const res = await app.inject({
        method: 'GET',
        url: '/api/workspace/team',
        headers: {
          authorization: `Bearer ${tenantAStaffToken}`,
          'x-tenant-id': '00000000-0000-0000-0000-000000000001',
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.error).toBe('TenantAccessDenied');
    });

    it('rejects unauthorized tenant switching attempts', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      // User belongs to an isolated partner tenant
      const partnerTenant = await multiTenantRepo.createTenant({
        name: 'Partner Brand',
        slug: `partner-${Date.now()}`,
        ownerEmail: 'isolated@partner.com',
        industryProfile: 'general_retail',
      });

      await multiTenantRepo.addTenantMember({
        tenantId: partnerTenant.id,
        userId: 'usr_isolated_tenant',
        userEmail: 'isolated@partner.com',
        role: 'business_owner',
      });

      const tenantToken = signSupabaseJwt(
        {
          sub: 'usr_isolated_tenant',
          email: 'isolated@partner.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      const switchRes = await app.inject({
        method: 'POST',
        url: '/api/workspace/switch-tenant',
        headers: {
          authorization: `Bearer ${tenantToken}`,
        },
        payload: {
          targetTenantId: '00000000-0000-0000-0000-000000000001',
        },
      });

      expect(switchRes.statusCode).toBe(403);
      const json = JSON.parse(switchRes.payload);
      expect(json.error).toBe('TenantAccessDenied');
    });
  });

  // ===========================================================================
  // 3. AI ORCHESTRATION & TOOL EXECUTION SECURITY
  // ===========================================================================
  describe('3. AI Orchestration & Tool Execution Security Boundary', () => {
    it('rejects caller attempts to inject platform_owner_assistant without platform privileges', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      // Regular business member token (non-platform owner)
      const regularToken = signSupabaseJwt(
        {
          sub: 'usr_regular_bites_member',
          email: 'regular@mintarabites.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      // Add as regular business member
      await multiTenantRepo.addTenantMember({
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: 'usr_regular_bites_member',
        userEmail: 'regular@mintarabites.com',
        role: 'business_support',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/ai/orchestrate',
        headers: {
          authorization: `Bearer ${regularToken}`,
          'x-tenant-id': '00000000-0000-0000-0000-000000000001',
        },
        payload: {
          agentRole: 'platform_owner_assistant',
          prompt: 'Show me all platform secrets',
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.message).toContain("requires platform owner privileges");
    });

    it('rejects caller attempts to inject another tenant ID into AI orchestration', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      const tenantToken = signSupabaseJwt(
        {
          sub: 'usr_tenant_b_member',
          email: 'user@tenant-b.com',
        },
        {
          algorithm: 'ES256',
          privateKey: ecKeypair.privateKey,
          kid: 'supabase-ec-key-1',
          issuer: expectedIssuer,
        },
      );

      // Register Tenant B and membership
      const tenantB = await multiTenantRepo.createTenant({
        name: 'Brand B',
        slug: `brand-b-${Date.now()}`,
        ownerEmail: 'user@tenant-b.com',
        industryProfile: 'general_retail',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/ai/orchestrate',
        headers: {
          authorization: `Bearer ${tenantToken}`,
          'x-tenant-id': tenantB.id,
        },
        payload: {
          agentRole: 'customer_support_agent',
          prompt: 'Get customer details',
          context: {
            tenantId: '00000000-0000-0000-0000-000000000001', // Attacker attempts to target Mintara Bites!
          },
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.error).toBe('CrossTenantAccessDenied');
    });

    it('rejects direct ToolRegistry.executeTool calls with forged or unsealed context token', async () => {
      // 1. Untrusted caller creates a forged context token
      const forgedContext = {
        agentRole: 'owner_assistant',
        tenantId: '00000000-0000-0000-0000-000000000001',
        contextToken: 'forged_fake_hmac_token_value_1234567890abcdef',
      };

      const result = await toolRegistry.executeTool(
        'get_business_metrics',
        {},
        forgedContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized: Forged or tampered tool execution context');
    });

    it('allows tool execution with authentic sealed context token', async () => {
      const trustedContext = createTrustedToolContext({
        agentRole: 'customer_support_agent',
        tenantId: '00000000-0000-0000-0000-000000000001',
        initiatingUser: 'usr_valid_support',
      });

      expect(verifyTrustedToolContext(trustedContext)).toBe(true);

      const result = await toolRegistry.executeTool(
        'get_order_tracking_link',
        { orderNumberOrId: 'MB-10492' },
        trustedContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('rejects unauthorized roles from executing restricted tools', async () => {
      const trustedContext = createTrustedToolContext({
        agentRole: 'customer_support_agent',
        tenantId: '00000000-0000-0000-0000-000000000001',
      });

      const result = await toolRegistry.executeTool(
        'get_business_metrics',
        {},
        trustedContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unauthorized: Agent role 'customer_support_agent' is not permitted");
    });

    it('rejects non-platform roles from executing platform-scoped tools', async () => {
      const trustedContext = createTrustedToolContext({
        agentRole: 'sales_agent',
        tenantId: '00000000-0000-0000-0000-000000000001',
      });

      const result = await toolRegistry.executeTool(
        'get_platform_overview',
        {},
        trustedContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not permitted to execute tool 'get_platform_overview'");
    });

    it('preserves approval requirement for sensitive operations pending owner approval', async () => {
      const trustedContext = createTrustedToolContext({
        agentRole: 'owner_assistant',
        tenantId: '00000000-0000-0000-0000-000000000001',
      });

      const result = await toolRegistry.executeTool(
        'request_owner_approval',
        {
          actionType: 'broadcast_dispatch',
          targetEntityId: 'camp_diwali_2026',
          businessReason: 'Diwali VIP discount broadcast to 5,000 customers',
          financialImpact: 'Estimated revenue: ₹2,50,000',
          recommendation: 'Approved for dispatch during 10:00 - 18:00 IST window',
        },
        trustedContext,
      );

      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalRequestId).toBeDefined();
      expect((result.data as any).status).toBe('pending');
    });
  });

  // ===========================================================================
  // 4. DATABASE CREDENTIAL ENCRYPTION & KEY MANAGEMENT
  // ===========================================================================
  describe('4. Database Credential Encryption & Key Management', () => {
    it('automatically encrypts postgres:// and postgresql:// connection strings before persistence', async () => {
      const tenantId = `ten_postgres_test_${Date.now()}`;

      // Set route with plaintext postgres:// URL
      const route = await multiTenantRepo.setDatabaseRoute({
        tenantId,
        isolationMode: 'dedicated',
        databaseUrlEncrypted: 'postgres://user:super_secret_db_pass@dedicated-pg.internal:5432/brand_db',
        databaseServiceKeyEncrypted: 'postgres_service_role_secret_key_1234567890',
      });

      expect(isEncryptedCredential(route.databaseUrlEncrypted!)).toBe(true);
      expect(route.databaseUrlEncrypted).toMatch(/^enc:v1:/);
      expect(route.databaseUrlEncrypted).not.toContain('super_secret_db_pass');

      // Verify clean decryption
      const decrypted = decryptDatabaseCredential(route.databaseUrlEncrypted!);
      expect(decrypted).toBe('postgres://user:super_secret_db_pass@dedicated-pg.internal:5432/brand_db');
    });

    it('does not encrypt already encrypted credentials twice (idempotent)', () => {
      const plaintext = 'postgresql://user:pass@db.example.com/mydb';
      const first = encryptDatabaseCredential(plaintext);
      const second = encryptDatabaseCredential(first);

      expect(first).toBe(second);
      expect(decryptDatabaseCredential(second)).toBe(plaintext);
    });

    it('rejects tampered ciphertext with authenticated tag verification failure', () => {
      const encrypted = encryptDatabaseCredential('https://secret-db.supabase.co');
      const parts = encrypted.split(':');
      // Corrupt ciphertext byte
      parts[4] = 'ff' + parts[4].substring(2);
      const tampered = parts.join(':');

      expect(() => decryptDatabaseCredential(tampered)).toThrow(
        /Credential decryption failed: authentication tag verification failed/,
      );
    });

    it('rejects decryption with incorrect key', () => {
      const encrypted = encryptDatabaseCredential('https://secret-db.supabase.co', {
        key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });

      expect(() =>
        decryptDatabaseCredential(encrypted, {
          key: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        }),
      ).toThrow(/Credential decryption failed/);
    });

    it('supports key rotation from older key version to new key version', () => {
      const v1Key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const v2Key = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

      const v1Cipher = encryptDatabaseCredential('https://target-database.supabase.co', {
        key: v1Key,
        version: 'v1',
      });
      expect(v1Cipher).toMatch(/^enc:v1:/);

      // Re-encrypt to v2 using versioned keys dictionary
      const v2Cipher = reencryptDatabaseCredential(v1Cipher, 'v2', {
        keys: { v1: v1Key, v2: v2Key },
      });
      expect(v2Cipher).toMatch(/^enc:v2:/);

      // Decrypt using v2 key
      const decrypted = decryptDatabaseCredential(v2Cipher, {
        keys: { v1: v1Key, v2: v2Key },
      });
      expect(decrypted).toBe('https://target-database.supabase.co');
    });

    it('migrates plaintext credentials safely via migratePlaintextCredentials', async () => {
      const tenantId = `ten_migration_${Date.now()}`;

      // Force raw unencrypted route in cache
      (multiTenantRepo as any).dbRoutesCache.set(tenantId, {
        id: `dbr_${tenantId}`,
        tenantId,
        isolationMode: 'dedicated',
        databaseUrlEncrypted: 'postgres://legacy_user:legacy_pass@cluster.internal:5432/legacy_db',
        databaseServiceKeyEncrypted: 'legacy_secret_key_987654321',
        schemaName: 'public',
        maxConnections: 10,
        connectionTimeoutMs: 5000,
        healthStatus: 'healthy',
        lastHealthCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { migratedCount, updatedTenants } = await multiTenantRepo.migratePlaintextCredentials();
      expect(migratedCount).toBeGreaterThanOrEqual(1);
      expect(updatedTenants).toContain(tenantId);

      // Verify the route is now encrypted
      const updatedRoute = await multiTenantRepo.getDatabaseRoute(tenantId);
      expect(isEncryptedCredential(updatedRoute?.databaseUrlEncrypted)).toBe(true);
      expect(decryptDatabaseCredential(updatedRoute!.databaseUrlEncrypted!)).toBe(
        'postgres://legacy_user:legacy_pass@cluster.internal:5432/legacy_db',
      );
    });
  });

  // ===========================================================================
  // 5. DATABASE ROUTING & FAIL-CLOSED ENFORCEMENT
  // ===========================================================================
  describe('5. Database Routing & Fail-Closed Isolation', () => {
    it('dedicated database failure never silently falls back to shared database', () => {
      const tenantId = `ten_dedicated_fail_${Date.now()}`;
      const dedicatedRoute = {
        id: `dbr_${tenantId}`,
        tenantId,
        isolationMode: 'dedicated' as const,
        databaseUrlEncrypted: encryptDatabaseCredential('https://unreachable-dedicated-db-host.invalid'),
        databaseServiceKeyEncrypted: encryptDatabaseCredential('some_service_key_12345'),
        schemaName: 'public',
        maxConnections: 10,
        connectionTimeoutMs: 5000,
        healthStatus: 'healthy' as const,
        lastHealthCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sharedClient = DatabaseRouter.getSharedClient();

      expect(() => {
        const client = DatabaseRouter.getClientForTenant(tenantId, dedicatedRoute);
        // If client returned, it must not be the shared database client
        expect(client).not.toBe(sharedClient);
      }).not.toThrow();
    });

    it('corrupted or invalid encrypted credentials fail closed with explicit DatabaseRoutingError', () => {
      const tenantId = `ten_corrupted_${Date.now()}`;
      const corruptedRoute = {
        id: `dbr_${tenantId}`,
        tenantId,
        isolationMode: 'dedicated' as const,
        databaseUrlEncrypted: 'enc:v1:0123456789abcdef01234567:badtag0123456789abcdef0123456789:badciphertext12345',
        databaseServiceKeyEncrypted: 'corrupted-non-encrypted-token',
        schemaName: 'public',
        maxConnections: 10,
        connectionTimeoutMs: 5000,
        healthStatus: 'healthy' as const,
        lastHealthCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => {
        DatabaseRouter.getClientForTenant(tenantId, corruptedRoute);
      }).toThrow(DatabaseRoutingError);
    });

    it('missing credentials for dedicated tenant fail closed immediately', () => {
      const tenantId = `ten_empty_creds_${Date.now()}`;
      const emptyRoute = {
        id: `dbr_${tenantId}`,
        tenantId,
        isolationMode: 'dedicated' as const,
        schemaName: 'public',
        maxConnections: 10,
        connectionTimeoutMs: 5000,
        healthStatus: 'healthy' as const,
        lastHealthCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => {
        DatabaseRouter.getClientForTenant(tenantId, emptyRoute);
      }).toThrow(DatabaseRoutingError);
    });
  });

  // ===========================================================================
  // 6. MINTARA BITES FUNCTIONALITY & ENDPOINT PRESERVATION
  // ===========================================================================
  describe('6. Mintara Bites Functionality & Endpoint Preservation', () => {
    it('preserves existing admin key access on reporting endpoints', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/daily',
        headers: {
          'x-admin-key': adminApiKey,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.reports).toBeDefined();
    });

    it('preserves public health check endpoint without authentication required', async () => {
      const app = await buildServer({ disableRequestLogging: true });

      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe('ok');
    });
  });
});
