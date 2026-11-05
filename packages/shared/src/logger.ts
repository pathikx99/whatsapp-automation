import pino, { Logger, LoggerOptions } from 'pino';

const SENSITIVE_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'serviceRoleKey',
  '*.serviceRoleKey',
  'service_role_key',
  '*.service_role_key',
];

export interface LoggerConfig {
  name?: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const level = config.level || process.env.LOG_LEVEL || 'info';
  const isPretty =
    config.pretty ?? (process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY === 'true');

  const options: LoggerOptions = {
    name: config.name || 'whatsapp-platform',
    level,
    redact: {
      paths: SENSITIVE_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  if (isPretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}
