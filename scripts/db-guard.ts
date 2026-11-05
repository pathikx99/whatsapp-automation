import { execSync } from 'node:child_process';
import { getConfig } from '../packages/config/src/index.js';
import { assertLocalDatabaseUrl } from '../packages/database/src/safety.js';
import { createLogger } from '../packages/shared/src/logger.js';

const logger = createLogger({ name: 'db-guard' });

async function runGuardedDbCommand() {
  const action = process.argv[2];

  if (!action || action !== 'reset') {
    logger.error('Usage: tsx scripts/db-guard.ts reset');
    process.exit(1);
  }

  try {
    const config = getConfig();

    // 1. Never allow db reset in production environment
    if (config.NODE_ENV === 'production' || config.APP_ENV === 'production') {
      logger.fatal(
        { nodeEnv: config.NODE_ENV, appEnv: config.APP_ENV },
        'CRITICAL SAFETY BLOCKED: Cannot run db:reset in production environment.',
      );
      process.exit(1);
    }

    // 2. Validate LOCAL_DATABASE_URL points to localhost/127.0.0.1
    assertLocalDatabaseUrl(config.LOCAL_DATABASE_URL, 'supabase db reset');

    logger.info(
      { targetUrl: config.LOCAL_SUPABASE_URL },
      'Safety check passed. Executing local Supabase database reset...',
    );

    // 3. Execute local-only Supabase reset
    execSync('supabase db reset --linked=false', {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_YES: 'true' },
    });

    logger.info('Local database reset completed successfully.');
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : error },
      'Database guard aborted operation for safety.',
    );
    process.exit(1);
  }
}

void runGuardedDbCommand();

