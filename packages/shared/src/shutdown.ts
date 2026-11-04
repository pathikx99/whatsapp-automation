import type { Logger } from 'pino';

export interface ShutdownOptions {
  timeoutMs?: number;
}

export function registerShutdownHandler(
  logger: Logger,
  cleanup: () => Promise<void> | void,
  options: ShutdownOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? 10000;
  let isShuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress, forcing immediate exit');
      process.exit(1);
    }
    isShuttingDown = true;
    logger.info({ signal }, 'Received termination signal, initiating graceful shutdown');

    const timeout = setTimeout(() => {
      logger.error({ timeoutMs }, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);

    try {
      await cleanup();
      clearTimeout(timeout);
      logger.info('Graceful shutdown completed successfully');
      process.exit(0);
    } catch (err) {
      clearTimeout(timeout);
      logger.error({ err }, 'Error occurred during graceful shutdown');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void handleSignal('SIGTERM'));
  process.once('SIGINT', () => void handleSignal('SIGINT'));
}
