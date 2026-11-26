export interface AppConfig {
  /** Path to the SQLite file. Required, so a test or production file is never used by accident. */
  databasePath: string;
  /** TCP port the API listens on. */
  port: number;
  /** Path to the common-password blocklist (used by F1.T2). */
  blocklistPath: string;
  /** Session cookie `Secure` flag. Only the test-only override turns it off (F1.R7). */
  cookieSecure: boolean;
}

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_PORT = 3000;
const DEFAULT_BLOCKLIST_PATH = 'src/auth/blocklist.txt';

function parsePort(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`PORT must be a whole number from 1 to 65535, got "${raw}"`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, got "${raw}"`);
  }
  return port;
}

/**
 * Reads configuration from environment variables. Pure: the caller passes the
 * environment in, so tests pass a plain object.
 */
export function loadConfig(env: Env): AppConfig {
  const databasePath = env.DATABASE_PATH?.trim();
  if (!databasePath) {
    throw new Error('Missing required environment variable DATABASE_PATH');
  }

  const port = parsePort(env.PORT ?? String(DEFAULT_PORT));
  const blocklistPath = env.BLOCKLIST_PATH?.trim() || DEFAULT_BLOCKLIST_PATH;

  // The override exists only for local tests over plain HTTP. Any other value keeps Secure on.
  const cookieSecure = env.TEST_ALLOW_INSECURE_COOKIES !== 'true';

  return { databasePath, port, blocklistPath, cookieSecure };
}
