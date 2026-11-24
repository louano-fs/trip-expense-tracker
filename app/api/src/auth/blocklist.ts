// Blocklist check (F1.R12). Pure functions. The list is passed in, never read here.
import { normalizeEmail } from './validation.ts';

/** A blocklist built by buildBlocklist: entries are NFC and lowercase. */
export type Blocklist = ReadonlySet<string>;

/**
 * Starter set of common passwords, written for this project (not downloaded).
 * Every entry is 15+ characters and lowercase. The full list is a later follow-up.
 * "trip expense" is 12 characters, so it is left out: the 15-character minimum
 * (F1.R3) means it could never be an accepted password anyway.
 */
export const STARTER_BLOCKLIST: readonly string[] = [
  'trip expense tracker',
  'expense tracker',
  'correct horse battery staple',
  'iloveyou1234567890',
  'password1234567',
  'passwordpassword',
  'qwertyuiop123456',
  'abcdefghijklmnop',
  'letmein1234567890',
  'welcomewelcome1',
  'football1234567',
  'monkeymonkey1234',
  'dragonball123456',
  'master1234567890',
  'sunshine12345678',
  'princess12345678',
  'trustno1trustno1',
  'iloveyouforever1',
  '123456789012345',
  'superman12345678',
  'changeme12345678',
];

/** Normalizes a value for comparison: NFC, then lowercase. Spaces are kept as typed. */
function comparisonKey(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

/**
 * Builds a blocklist from entries (for example, the lines of blocklist.txt).
 * Each entry is compared ignoring letter case and after NFC normalization.
 * Empty entries are skipped.
 */
export function buildBlocklist(entries: Iterable<string>): Blocklist {
  const set = new Set<string>();
  for (const entry of entries) {
    if (entry !== '') {
      set.add(comparisonKey(entry));
    }
  }
  return set;
}

/**
 * True when the password matches a listed entry, the email, or the part before `@`.
 * The whole password is compared (never cut short), ignoring case (F1.AC17).
 */
export function isBlockedPassword(password: string, email: string, list: Blocklist): boolean {
  const candidate = comparisonKey(password);
  if (list.has(candidate)) {
    return true;
  }
  const normalizedEmail = normalizeEmail(email);
  if (candidate === comparisonKey(normalizedEmail)) {
    return true;
  }
  const atIndex = normalizedEmail.indexOf('@');
  const localPart = atIndex === -1 ? normalizedEmail : normalizedEmail.slice(0, atIndex);
  return localPart !== '' && candidate === comparisonKey(localPart);
}
