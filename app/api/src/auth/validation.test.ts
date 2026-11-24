import { describe, expect, it } from 'vitest';
import { normalizeEmail, validateEmail, validatePasswordLength } from './validation.ts';

describe('F1.AC2 email normalization', () => {
  it('F1.AC2 normalizes "  SAM@Mail.com " to sam@mail.com', () => {
    expect(normalizeEmail('  SAM@Mail.com ')).toBe('sam@mail.com');
  });
});

describe('F1.AC4 email format and length', () => {
  it('F1.AC4 rejects an email without an @', () => {
    const result = validateEmail(normalizeEmail('sam.mail.com'));
    expect(result).toEqual({
      ok: false,
      field: 'email',
      message: 'Enter a valid email address, like name@example.com.',
    });
  });

  it('F1.AC4 rejects an email without a domain', () => {
    const result = validateEmail(normalizeEmail('sam@'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
      expect(result.message).toBe('Enter a valid email address, like name@example.com.');
    }
  });

  it('F1.AC4 rejects an email of 255 characters', () => {
    const tooLong = 'a'.repeat(255 - '@example.com'.length) + '@example.com';
    expect(tooLong.length).toBe(255);
    const result = validateEmail(normalizeEmail(tooLong));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Enter a valid email address, like name@example.com.');
    }
  });

  it('F1.AC4 accepts an email of 254 characters', () => {
    const maxLength = 'a'.repeat(254 - '@example.com'.length) + '@example.com';
    expect(maxLength.length).toBe(254);
    expect(validateEmail(maxLength)).toEqual({ ok: true, email: maxLength });
  });

  it('F1.AC4 accepts a valid email', () => {
    expect(validateEmail(normalizeEmail('  SAM@Mail.com '))).toEqual({
      ok: true,
      email: 'sam@mail.com',
    });
  });

  it('F1.AC4 rejects an empty email with the empty-field message', () => {
    expect(validateEmail(normalizeEmail('   '))).toEqual({
      ok: false,
      field: 'email',
      message: 'Enter your email address.',
    });
  });
});

describe('F1.AC3 password minimum length', () => {
  it('F1.AC3 rejects 14 characters with the at-least-15 message', () => {
    expect(validatePasswordLength('a'.repeat(14))).toEqual({
      ok: false,
      field: 'password',
      message:
        'Password must be at least 15 characters. A short phrase is easy to remember.',
    });
  });

  it('F1.AC3 accepts 15 characters', () => {
    expect(validatePasswordLength('a'.repeat(15))).toEqual({
      ok: true,
      password: 'a'.repeat(15),
    });
  });

  it('F1.AC3 counts each code point as one character (15 emoji accepted, 14 rejected)', () => {
    expect(validatePasswordLength('😀'.repeat(15)).ok).toBe(true);
    expect(validatePasswordLength('😀'.repeat(14)).ok).toBe(false);
  });

  it('F1.AC3 does not trim: 14 letters plus one leading space is 15 and keeps the space', () => {
    const result = validatePasswordLength(' ' + 'a'.repeat(14));
    expect(result).toEqual({ ok: true, password: ' ' + 'a'.repeat(14) });
  });

  it('F1.AC3 rejects an empty password with the empty-field message', () => {
    expect(validatePasswordLength('')).toEqual({
      ok: false,
      field: 'password',
      message: 'Enter your password.',
    });
  });
});

describe('F1.AC16 password maximum length', () => {
  it('F1.AC16 accepts 128 characters', () => {
    expect(validatePasswordLength('a'.repeat(128)).ok).toBe(true);
  });

  it('F1.AC16 rejects 129 characters with the 128-or-fewer message', () => {
    expect(validatePasswordLength('a'.repeat(129))).toEqual({
      ok: false,
      field: 'password',
      message: 'Password must be 128 characters or fewer.',
    });
  });
});

describe('F1.R3 password normalization', () => {
  it('F1.R3 returns the NFC form so composed and decomposed input match', () => {
    const composed = 'é'.repeat(15); // U+00E9 each
    const decomposed = 'é'.repeat(15); // e + combining acute, 30 code units, 30 code points
    const a = validatePasswordLength(composed);
    const b = validatePasswordLength(decomposed);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.password).toBe(b.password);
    }
  });
});
