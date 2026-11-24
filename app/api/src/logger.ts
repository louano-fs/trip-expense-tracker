import pino from 'pino';

/** Fields that must never reach a log line, whatever code logs them. */
export const REDACT_PATHS = [
  'password',
  'password_hash',
  'cookie',
  'set-cookie',
  'req.headers.cookie',
];

export interface LoggerOptions {
  /** Where log lines go. Defaults to standard output. Tests pass an in-memory fake. */
  destination?: { write(msg: string): unknown };
  /** Minimum level to write. Defaults to `info`. */
  level?: string;
  /** Pass `false` in tests so no clock value is written. Omit for the pino default. */
  timestamp?: false;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
  const { destination, level = 'info', timestamp } = options;

  const pinoOptions: pino.LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    ...(timestamp === false ? { timestamp: false } : {}),
  };

  return destination ? pino(pinoOptions, destination) : pino(pinoOptions);
}
