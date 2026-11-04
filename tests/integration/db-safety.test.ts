import { describe, it, expect } from 'vitest';
import {
  isLocalHost,
  assertLocalDatabaseUrl,
  assertReadOnlySql,
} from '../../packages/database/src/safety.js';
import { DatabaseSafetyError } from '../../packages/shared/src/errors.js';

describe('Database Safety & Isolation Guards', () => {
  describe('Host Verification (isLocalHost)', () => {
    it('should identify local hostnames correctly', () => {
      expect(isLocalHost('localhost')).toBe(true);
      expect(isLocalHost('127.0.0.1')).toBe(true);
      expect(isLocalHost('::1')).toBe(true);
      expect(isLocalHost('supabase_db')).toBe(true);
      expect(isLocalHost('host.docker.internal')).toBe(true);
    });

    it('should reject remote hostnames and IPs', () => {
      expect(isLocalHost('db.project.supabase.co')).toBe(false);
      expect(isLocalHost('aws.rds.amazonaws.com')).toBe(false);
      expect(isLocalHost('192.168.1.100')).toBe(false);
      expect(isLocalHost('custom-domain.com')).toBe(false);
      expect(isLocalHost('')).toBe(false);
    });
  });

  describe('Local Database URL Guard (assertLocalDatabaseUrl)', () => {
    it('should allow valid local PostgreSQL connection URLs', () => {
      expect(() =>
        assertLocalDatabaseUrl(
          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          'test operation',
        ),
      ).not.toThrow();

      expect(() =>
        assertLocalDatabaseUrl(
          'postgresql://postgres:postgres@localhost:5432/postgres',
          'test operation',
        ),
      ).not.toThrow();
    });

    it('should throw DatabaseSafetyError when URL points to a remote database', () => {
      expect(() =>
        assertLocalDatabaseUrl(
          'postgresql://user:pass@db.xyz.supabase.co:5432/postgres',
          'db:reset',
        ),
      ).toThrow(DatabaseSafetyError);

      expect(() =>
        assertLocalDatabaseUrl(
          'postgresql://user:pass@remote-host.com:5432/postgres',
          'run migrations',
        ),
      ).toThrow(DatabaseSafetyError);
    });
  });

  describe('Read-Only SQL Statement Guard (assertReadOnlySql)', () => {
    it('should permit valid read-only query statements', () => {
      expect(() => assertReadOnlySql('SELECT * FROM orders WHERE id = $1')).not.toThrow();
      expect(() => assertReadOnlySql('SELECT count(*) FROM customers')).not.toThrow();
      expect(() => assertReadOnlySql('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent')).not.toThrow();
    });

    it('should reject destructive or modifying SQL statements with DatabaseSafetyError', () => {
      expect(() => assertReadOnlySql('DELETE FROM orders WHERE id = 1')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('INSERT INTO orders (id) VALUES (1)')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('UPDATE customers SET status = "inactive"')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('DROP TABLE products CASCADE')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('TRUNCATE orders')).toThrow(DatabaseSafetyError);
      expect(() => assertReadOnlySql('ALTER TABLE customers ADD COLUMN balance int')).toThrow(DatabaseSafetyError);
    });
  });
});
