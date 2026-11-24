import { Algorithm, parseOptions } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logger.ts';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts';

// In-memory log sink, so a warning can be checked without writing to standard output.
function memoryLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    destination: { write: (msg: string) => lines.push(msg) },
    timestamp: false,
  });
  return { logger, lines };
}

describe('F1.AC14 long passwords', () => {
  it('F1.AC14 verifies a 128-character password', async () => {
    const password = 'a'.repeat(127) + 'b';
    const stored = await hashPassword(password);
    expect(await verifyPassword(stored, password)).toBe(true);
  });

  it('F1.AC14 rejects the same 128-character password with the last character changed', async () => {
    const stored = await hashPassword('a'.repeat(127) + 'b');
    expect(await verifyPassword(stored, 'a'.repeat(127) + 'c')).toBe(false);
  });
});

describe('F1.AC15 leading spaces are kept', () => {
  it('F1.AC15 verifies a password with a leading space when the space is typed', async () => {
    const stored = await hashPassword(' my secret phrase');
    expect(await verifyPassword(stored, ' my secret phrase')).toBe(true);
  });

  it('F1.AC15 rejects the same password without the leading space', async () => {
    const stored = await hashPassword(' my secret phrase');
    expect(await verifyPassword(stored, 'my secret phrase')).toBe(false);
  });

  it('F1.AC15 does not trim a trailing space either', async () => {
    const stored = await hashPassword('my secret phrase ');
    expect(await verifyPassword(stored, 'my secret phrase')).toBe(false);
  });
});

describe('F1.AC18 Unicode forms', () => {
  // 'é' as one code point (composed) and as 'e' plus a combining acute accent (decomposed).
  const composed = 'café in lisbon, quiet morning';
  const decomposed = 'café in lisbon, quiet morning';

  it('F1.AC18 verifies the decomposed form against a hash made from the composed form', async () => {
    const stored = await hashPassword(composed);
    expect(await verifyPassword(stored, decomposed)).toBe(true);
  });

  it('F1.AC18 verifies the composed form against a hash made from the decomposed form', async () => {
    const stored = await hashPassword(decomposed);
    expect(await verifyPassword(stored, composed)).toBe(true);
  });
});

describe('F1.R3 stored hash format and settings', () => {
  it('F1.R3 stores an Argon2id hash with the spec parameters m=19456, t=2, p=1', async () => {
    const stored = await hashPassword('my secret phrase');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(stored).toContain('m=19456,t=2,p=1');
    expect(parseOptions(stored)).toMatchObject({
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it('F1.R3 gives a different salt, and so a different hash, for the same password', async () => {
    const first = await hashPassword('my secret phrase');
    const second = await hashPassword('my secret phrase');
    expect(first).not.toBe(second);
  });

  it('F1.R3 the dummy hash uses the same Argon2id settings', () => {
    expect(DUMMY_HASH.startsWith('$argon2id$')).toBe(true);
    expect(DUMMY_HASH).toContain('m=19456,t=2,p=1');
  });

  it('F1.R3 returns false, not an error, for a malformed stored hash, and logs a warning without the hash', async () => {
    const { logger, lines } = memoryLogger();
    const badHash = 'not-a-real-hash-value';
    expect(await verifyPassword(badHash, 'my secret phrase', logger)).toBe(false);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as { level: number; errorKind: string; msg: string };
    expect(entry.level).toBe(40);
    expect(typeof entry.errorKind).toBe('string');
    expect(lines[0]).not.toContain(badHash);
    expect(lines[0]).not.toContain('my secret phrase');
  });
});
