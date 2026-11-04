import { DatabaseSafetyError } from '@whatsapp-platform/shared';

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'supabase_db',
  'host.docker.internal',
]);

/**
 * Checks whether a database host points to a strictly local development environment.
 */
export function isLocalHost(host: string): boolean {
  if (!host) return false;
  const normalized = host.toLowerCase().trim();
  return LOCAL_HOSTNAMES.has(normalized);
}

/**
 * Ensures that a database connection string points to a local instance.
 * Throws DatabaseSafetyError if pointing to any remote/cloud environment.
 */
export function assertLocalDatabaseUrl(
  databaseUrl: string,
  operationName = 'destructive database operation',
): void {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;

    if (!isLocalHost(host)) {
      throw new DatabaseSafetyError(
        `Attempted to perform '${operationName}' against non-local host '${host}'`,
        { host },
      );
    }
  } catch (error) {
    if (error instanceof DatabaseSafetyError) {
      throw error;
    }
    throw new DatabaseSafetyError(
      `Invalid database connection string provided for '${operationName}'`,
    );
  }
}

/**
 * Enforces that SQL statements executed on the ecommerce database are strictly read-only.
 * Any modification, DDL, or privilege alteration command is blocked.
 */
const FORBIDDEN_SQL_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COMMENT',
  'RENAME',
  'REPLACE',
];

const FORBIDDEN_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_SQL_KEYWORDS.join('|')})\\b`,
  'i',
);

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  const match = trimmed.match(FORBIDDEN_PATTERN);

  if (match) {
    throw new DatabaseSafetyError(
      `Forbidden modification keyword '${match[1]?.toUpperCase()}' detected in read-only query`,
      { sqlSnippet: trimmed.substring(0, 100) },
    );
  }
}
