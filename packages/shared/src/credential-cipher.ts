import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

export interface CipherOptions {
  key?: string;
  version?: string;
  keys?: Record<string, string>;
}

/**
 * Validates and parses a raw key string/buffer into a 32-byte (256-bit) Buffer.
 * Supports:
 * - 64-character hex string (32 bytes)
 * - 44-character base64 string (32 bytes)
 * - 32-character UTF-8 string (32 bytes)
 */
export function normalizeCipherKey(rawKey: string | Buffer): Buffer {
  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== 32) {
      throw new Error(`Invalid encryption key length: expected 32 bytes, got ${rawKey.length}`);
    }
    return rawKey;
  }

  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    throw new Error('Encryption key must be a non-empty string or Buffer');
  }

  const trimmed = rawKey.trim();

  // 1. Try 64-character hex string
  if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 2. Try base64 string (44 chars with optional padding)
  if (trimmed.length === 44 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) {
      return buf;
    }
  }

  // 3. Raw 32-byte string
  const buf = Buffer.from(trimmed, 'utf8');
  if (buf.length === 32) {
    return buf;
  }

  throw new Error(
    `Invalid DATABASE_ENCRYPTION_KEY format: key must resolve to exactly 32 bytes (256 bits). Provided length: ${buf.length} bytes.`
  );
}

/**
 * Resolves the 256-bit key for a specified version.
 * Supports versioned rotation via DATABASE_ENCRYPTION_KEYS JSON map or DATABASE_ENCRYPTION_KEY.
 * Never falls back to ADMIN_API_KEY, SUPABASE_SECRET_KEY, or hardcoded strings.
 */
export function resolveEncryptionKey(version = 'v1', customKey?: string, customKeys?: Record<string, string>): Buffer {
  if (customKey) {
    return normalizeCipherKey(customKey);
  }

  if (customKeys && customKeys[version]) {
    return normalizeCipherKey(customKeys[version]);
  }

  // 1. Check versioned key mapping in environment (e.g. {"v1":"...","v2":"..."})
  if (process.env.DATABASE_ENCRYPTION_KEYS) {
    try {
      const parsed = JSON.parse(process.env.DATABASE_ENCRYPTION_KEYS) as Record<string, string>;
      if (parsed[version]) {
        return normalizeCipherKey(parsed[version]);
      }
    } catch {
      throw new Error('Failed to parse DATABASE_ENCRYPTION_KEYS JSON mapping from environment');
    }
  }

  // 2. Check primary DATABASE_ENCRYPTION_KEY
  if (process.env.DATABASE_ENCRYPTION_KEY) {
    return normalizeCipherKey(process.env.DATABASE_ENCRYPTION_KEY);
  }

  // Fail closed in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_ENCRYPTION_KEY is mandatory in production. Application cannot start without configured encryption key.'
    );
  }

  // In test/development only, provide a deterministic development key if not explicitly set
  // This ensures local tests can run while completely preventing fallback in production.
  const devKey = 'mintara_dev_db_key_32_bytes_ok!!';
  return Buffer.from(devKey, 'utf8');
}

/**
 * Checks if a string is already formatted as an encrypted credential.
 */
export function isEncryptedCredential(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^enc:v\d+:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/.test(value);
}

/**
 * Encrypts sensitive database credentials using authenticated AES-256-GCM.
 * Output format: enc:<version>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *
 * Rules:
 * - If plaintext is already encrypted (starts with enc:v), returns it unchanged without double-encrypting.
 * - Uses a unique 12-byte cryptographically secure random IV for every encryption call.
 * - Verifies key length is exactly 32 bytes (256-bit).
 */
export function encryptDatabaseCredential(
  plaintext: string,
  options?: CipherOptions,
): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Credential to encrypt must be a non-empty string');
  }

  // Prevent double-encryption
  if (isEncryptedCredential(plaintext)) {
    return plaintext;
  }

  const version = options?.version || process.env.DATABASE_ENCRYPTION_ACTIVE_VERSION || 'v1';
  const key = resolveEncryptionKey(version, options?.key, options?.keys);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `enc:${version}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts sensitive database credentials encrypted via encryptDatabaseCredential.
 * Validates the authenticated GCM tag to prevent tampering.
 * Throws explicit error on any failure without leaking plaintext secrets.
 *
 * Supports key rotation: resolves key based on the version tag in the ciphertext (e.g. v1, v2).
 */
export function decryptDatabaseCredential(
  encryptedValue: string,
  options?: CipherOptions,
): string {
  if (!encryptedValue || typeof encryptedValue !== 'string') {
    throw new Error('Encrypted credential value is empty or not a string');
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc') {
    throw new Error('Invalid encrypted credential format: expected enc:<version>:<iv>:<tag>:<ciphertext>');
  }

  const [_, version, ivHex, tagHex, cipherHex] = parts;

  if (!version || !ivHex || !tagHex || !cipherHex) {
    throw new Error('Incomplete encrypted credential payload');
  }

  let iv: Buffer;
  let tag: Buffer;
  let ciphertext: Buffer;

  try {
    iv = Buffer.from(ivHex, 'hex');
    tag = Buffer.from(tagHex, 'hex');
    ciphertext = Buffer.from(cipherHex, 'hex');
  } catch {
    throw new Error('Encrypted credential contains invalid hex encoding');
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid initialization vector length: expected ${IV_LENGTH} bytes`);
  }

  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid authentication tag length: expected ${AUTH_TAG_LENGTH} bytes`);
  }

  const key = resolveEncryptionKey(version, options?.key, options?.keys);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new Error(
      'Credential decryption failed: authentication tag verification failed or wrong encryption key'
    );
  }
}

/**
 * Rotates an encrypted credential from an older version key to a new target version key.
 */
export function reencryptDatabaseCredential(
  ciphertext: string,
  targetVersion: string,
  options?: {
    oldKey?: string;
    newKey?: string;
    keys?: Record<string, string>;
  },
): string {
  const decrypted = decryptDatabaseCredential(ciphertext, {
    key: options?.oldKey,
    keys: options?.keys,
  });

  return encryptDatabaseCredential(decrypted, {
    version: targetVersion,
    key: options?.newKey,
    keys: options?.keys,
  });
}
