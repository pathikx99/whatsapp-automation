import crypto from 'node:crypto';

export interface SupabaseAuthClaims {
  sub: string;
  email: string;
  role?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export type SupportedJwtAlgorithm = 'ES256' | 'RS256' | 'HS256';

export const SUPPORTED_ALGORITHMS: ReadonlyArray<SupportedJwtAlgorithm> = ['ES256', 'RS256', 'HS256'];

export interface JwtVerifyOptions {
  secret?: string;
  publicKey?: crypto.KeyObject | string;
  jwksUrl?: string;
  issuer?: string;
  audience?: string;
  clockToleranceSeconds?: number;
}

export interface JwtSignOptions {
  secret?: string;
  privateKey?: crypto.KeyObject | string;
  algorithm?: SupportedJwtAlgorithm;
  kid?: string;
  expiresInSeconds?: number;
  issuer?: string;
  audience?: string;
}

export type JwkRecord = Record<string, unknown> & {
  kty: string;
  alg?: string;
  kid?: string;
  use?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
};

// ============================================================================
// BASE64URL HELPERS
// ============================================================================

export function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function base64UrlDecodeToBuffer(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

// ============================================================================
// JWKS IN-MEMORY CACHE & FETCHING
// ============================================================================

interface CachedKey {
  key: crypto.KeyObject;
  alg: string;
  kid: string;
}

interface JwksCacheEntry {
  keys: Map<string, CachedKey>;
  lastFetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const testJwksRegistry = new Map<string, JwkRecord[]>();

export function clearJwksCache(): void {
  jwksCache.clear();
  testJwksRegistry.clear();
}

/**
 * Register test JWKS keys in-memory for unit and integration testing without network calls.
 */
export function setTestJwks(jwksUrl: string, keys: JwkRecord[]): void {
  testJwksRegistry.set(jwksUrl, keys);
  jwksCache.delete(jwksUrl);
}

/**
 * Resolves the configured Supabase JWKS URL.
 */
export function getSupabaseJwksUrl(): string | undefined {
  if (process.env.SUPABASE_JWKS_URL) {
    return process.env.SUPABASE_JWKS_URL;
  }
  if (process.env.SUPABASE_URL) {
    return `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  }
  return undefined;
}

/**
 * Resolves the configured Supabase JWT issuer.
 */
export function getExpectedSupabaseIssuer(): string | undefined {
  if (process.env.SUPABASE_URL) {
    return `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
  }
  return undefined;
}

/**
 * Retrieves the explicit legacy HS256 secret.
 * Note: Never defaults to service-role keys or hardcoded fallback secrets.
 */
export function getLegacyAuthJwtSecret(): string | undefined {
  return process.env.SUPABASE_JWT_SECRET || undefined;
}

/**
 * Fetches JWKS keys from either registered test store or remote URL.
 */
async function fetchJwksKeys(jwksUrl: string): Promise<Map<string, CachedKey>> {
  let keysData: JwkRecord[];

  if (testJwksRegistry.has(jwksUrl)) {
    keysData = testJwksRegistry.get(jwksUrl)!;
  } else {
    try {
      const response = await fetch(jwksUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`JWKS HTTP fetch failed with status ${response.status}`);
      }
      const json = (await response.json()) as { keys?: JwkRecord[] };
      keysData = Array.isArray(json.keys) ? json.keys : [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to retrieve Supabase JWKS from '${jwksUrl}': ${msg}`);
    }
  }

  const keyMap = new Map<string, CachedKey>();

  for (const jwk of keysData) {
    if (!jwk.kid || !jwk.kty) continue;
    try {
      const keyObj = crypto.createPublicKey({
        key: jwk as any,
        format: 'jwk',
      });
      const alg = (jwk.alg as string) || (jwk.kty === 'EC' ? 'ES256' : jwk.kty === 'RSA' ? 'RS256' : '');
      keyMap.set(jwk.kid, {
        key: keyObj,
        alg,
        kid: jwk.kid,
      });
    } catch {
      // Ignore invalid or unrecognized individual keys
    }
  }

  return keyMap;
}

/**
 * Resolves a public key object from the JWKS cache with controlled key-rotation refresh.
 */
export async function resolveJwksKey(
  jwksUrl: string,
  kid?: string,
  expectedAlg?: SupportedJwtAlgorithm,
): Promise<crypto.KeyObject> {
  const now = Date.now();
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
  const MIN_REFRESH_INTERVAL_MS = 5000; // Avoid hammering on unknown kid

  let entry = jwksCache.get(jwksUrl);

  // Initial fetch if not cached
  if (!entry || now - entry.lastFetchedAt > CACHE_TTL_MS) {
    const keys = await fetchJwksKeys(jwksUrl);
    entry = { keys, lastFetchedAt: now };
    jwksCache.set(jwksUrl, entry);
  }

  // Attempt to find key by kid
  if (kid && entry.keys.has(kid)) {
    const cached = entry.keys.get(kid)!;
    if (expectedAlg && cached.alg && cached.alg !== expectedAlg) {
      throw new Error(`JWKS key algorithm mismatch for kid '${kid}': expected ${expectedAlg}, got ${cached.alg}`);
    }
    return cached.key;
  }

  // If no kid provided and only 1 key exists in JWKS
  if (!kid && entry.keys.size === 1) {
    const single = Array.from(entry.keys.values())[0];
    if (single) return single.key;
  }

  // Key rotation handling: if kid is unknown, perform a controlled refresh once
  if (kid && now - entry.lastFetchedAt > MIN_REFRESH_INTERVAL_MS) {
    const refreshedKeys = await fetchJwksKeys(jwksUrl);
    entry = { keys: refreshedKeys, lastFetchedAt: now };
    jwksCache.set(jwksUrl, entry);

    if (entry.keys.has(kid)) {
      const cached = entry.keys.get(kid)!;
      if (expectedAlg && cached.alg && cached.alg !== expectedAlg) {
        throw new Error(`JWKS key algorithm mismatch for kid '${kid}': expected ${expectedAlg}, got ${cached.alg}`);
      }
      return cached.key;
    }
  }

  throw new Error(`Unknown or unrotated JWKS key identifier (kid: "${kid || 'undefined'}") from ${jwksUrl}`);
}

// ============================================================================
// SIGNING (For testing and local environments)
// ============================================================================

export function signSupabaseJwt(
  payload: Partial<SupabaseAuthClaims> & { sub: string; email: string },
  options?: JwtSignOptions,
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options?.expiresInSeconds ?? 3600;
  const alg = options?.algorithm || 'HS256';

  if (!SUPPORTED_ALGORITHMS.includes(alg)) {
    throw new Error(`Unsupported signing algorithm: ${alg}`);
  }

  const header: { alg: string; typ: string; kid?: string } = {
    alg,
    typ: 'JWT',
  };
  if (options?.kid) {
    header.kid = options.kid;
  }

  const fullPayload: SupabaseAuthClaims = {
    role: 'authenticated',
    aud: options?.audience ?? 'authenticated',
    iss: options?.issuer ?? getExpectedSupabaseIssuer() ?? 'https://platform.mintara.ai/auth/v1',
    iat: now,
    exp: now + expiresIn,
    nbf: now,
    ...payload,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  if (alg === 'HS256') {
    const secret = options?.secret || getLegacyAuthJwtSecret();
    if (!secret) {
      throw new Error(
        'HS256 signing requires an explicit secret or configured SUPABASE_JWT_SECRET environment variable'
      );
    }
    const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest();
    return `${dataToSign}.${base64UrlEncode(signature)}`;
  }

  if (alg === 'ES256') {
    if (!options?.privateKey) {
      throw new Error('ES256 signing requires a privateKey');
    }
    const sig = crypto.sign('sha256', Buffer.from(dataToSign), {
      key: options.privateKey as any,
      dsaEncoding: 'ieee-p1363',
    });
    return `${dataToSign}.${base64UrlEncode(sig)}`;
  }

  if (alg === 'RS256') {
    if (!options?.privateKey) {
      throw new Error('RS256 signing requires a privateKey');
    }
    const sig = crypto.sign('sha256', Buffer.from(dataToSign), options.privateKey);
    return `${dataToSign}.${base64UrlEncode(sig)}`;
  }

  throw new Error(`Unhandled algorithm ${alg}`);
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Cryptographically verifies a Supabase Auth JWT against asymmetric JWKS (ES256/RS256)
 * or legacy HS256 (if explicitly configured).
 *
 * Validates:
 * 1. Explicit supported algorithm (rejects 'none' and unapproved ciphers).
 * 2. Cryptographic signature.
 * 3. Token expiration (exp) and not-before (nbf).
 * 4. Required subject (sub) and email claims.
 * 5. Mandatory audience (default 'authenticated').
 * 6. Mandatory issuer (configured Supabase Auth issuer).
 */
export async function verifySupabaseJwt(
  token: string,
  options?: JwtVerifyOptions,
): Promise<SupabaseAuthClaims> {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or not a string');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT structure: must contain header, payload, and signature');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

  // 1. Parse and validate header
  let header: { alg?: string; typ?: string; kid?: string };
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
  } catch {
    throw new Error('Invalid JWT header encoding');
  }

  if (!header.alg || typeof header.alg !== 'string') {
    throw new Error('Missing algorithm in JWT header');
  }

  const alg = header.alg.toUpperCase() as SupportedJwtAlgorithm;
  if (!SUPPORTED_ALGORITHMS.includes(alg)) {
    throw new Error(`Unsupported JWT algorithm: '${header.alg}'. Allowed: ${SUPPORTED_ALGORITHMS.join(', ')}`);
  }

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signatureBuffer = base64UrlDecodeToBuffer(encodedSignature);

  // 2. Cryptographic signature check
  if (alg === 'HS256') {
    const secret = options?.secret || getLegacyAuthJwtSecret();
    if (!secret) {
      throw new Error(
        'HS256 verification rejected: project is not configured with legacy SUPABASE_JWT_SECRET'
      );
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(dataToSign).digest();
    if (
      signatureBuffer.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedSignature)
    ) {
      throw new Error('Invalid JWT signature: cryptographic verification failed');
    }
  } else if (alg === 'ES256' || alg === 'RS256') {
    let publicKey: crypto.KeyObject;

    if (options?.publicKey) {
      publicKey =
        typeof options.publicKey === 'string'
          ? crypto.createPublicKey(options.publicKey)
          : options.publicKey;
    } else {
      const jwksUrl = options?.jwksUrl || getSupabaseJwksUrl();
      if (!jwksUrl) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Supabase JWKS URL configuration is mandatory in production');
        }
        throw new Error('Missing JWKS URL configuration for asymmetric JWT verification');
      }
      publicKey = await resolveJwksKey(jwksUrl, header.kid, alg);
    }

    let isValid = false;
    try {
      if (alg === 'ES256') {
        isValid = crypto.verify(
          'sha256',
          Buffer.from(dataToSign),
          {
            key: publicKey,
            dsaEncoding: 'ieee-p1363',
          },
          signatureBuffer,
        );
      } else {
        isValid = crypto.verify(
          'sha256',
          Buffer.from(dataToSign),
          publicKey,
          signatureBuffer,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Cryptographic signature verification error: ${msg}`);
    }

    if (!isValid) {
      throw new Error('Invalid JWT signature: cryptographic verification failed');
    }
  }

  // 3. Parse and validate claims
  let claims: SupabaseAuthClaims;
  try {
    claims = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new Error('Invalid JWT payload encoding');
  }

  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new Error('JWT claims missing required subject (sub)');
  }

  if (!claims.email || typeof claims.email !== 'string') {
    throw new Error('JWT claims missing required email');
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options?.clockToleranceSeconds ?? 0;

  // Verify expiration (mandatory)
  if (typeof claims.exp !== 'number') {
    throw new Error('JWT claims missing mandatory expiration (exp)');
  }
  if (now - tolerance >= claims.exp) {
    throw new Error(`JWT expired at ${new Date(claims.exp * 1000).toISOString()}`);
  }

  // Verify not-before
  if (typeof claims.nbf === 'number' && now + tolerance < claims.nbf) {
    throw new Error(`JWT not active yet (nbf: ${new Date(claims.nbf * 1000).toISOString()})`);
  }

  // Verify audience (mandatory)
  const expectedAudience = options?.audience ?? 'authenticated';
  if (claims.aud !== expectedAudience) {
    throw new Error(`JWT audience mismatch: expected '${expectedAudience}', got '${claims.aud}'`);
  }

  // Verify issuer (mandatory if configured)
  const expectedIssuer = options?.issuer ?? getExpectedSupabaseIssuer();
  if (expectedIssuer) {
    if (claims.iss !== expectedIssuer) {
      throw new Error(`JWT issuer mismatch: expected '${expectedIssuer}', got '${claims.iss}'`);
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Supabase issuer configuration is mandatory in production');
  }

  return claims;
}
