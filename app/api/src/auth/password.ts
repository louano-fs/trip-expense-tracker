// Password hashing with Argon2id (F1.R3). Hashing is in-process; no database or network.

import { Algorithm, hash, hashSync, verify } from '@node-rs/argon2';
import { createLogger } from '../logger.ts';

/** Settings from F1.R3: OWASP minimum (19 MiB memory, 2 iterations, 1 thread). */
export const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

type WarnLogger = { warn(obj: object, msg: string): void };

const defaultLogger: WarnLogger = createLogger();

/** Unicode NFC, so the same password typed on different devices gives the same hash (F1.R3). Never trims. */
function toNfc(password: string): string {
  return password.normalize('NFC');
}

/** Hashes a password with a random salt. The output string holds the salt and settings. */
export function hashPassword(password: string): Promise<string> {
  return hash(toNfc(password), ARGON2_OPTIONS);
}

/**
 * Checks a password against a stored hash. Returns false for a wrong password.
 * A malformed stored hash also returns false; a warning is logged with the error kind only,
 * never the hash or the password.
 */
export async function verifyPassword(
  stored: string,
  password: string,
  logger: WarnLogger = defaultLogger,
): Promise<boolean> {
  try {
    return await verify(stored, toNfc(password));
  } catch (err: unknown) {
    const errorKind = err instanceof Error ? err.name : typeof err;
    logger.warn({ errorKind }, 'Stored password hash could not be read');
    return false;
  }
}

/**
 * A real Argon2id hash with the same settings, computed once at module load.
 * Login checks against it when the email is unknown, so both paths take similar time.
 * Its password is a fixed placeholder that no account uses, and it is never returned.
 */
export const DUMMY_HASH: string = hashSync('no-account-placeholder', ARGON2_OPTIONS);
