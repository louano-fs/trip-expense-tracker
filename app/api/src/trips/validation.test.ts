import { describe, expect, it } from 'vitest';
import { validateTripName } from './validation.ts';

describe('F2.AC2 trip name trimming and empty check', () => {
  it('F2.AC2 saves "  Lisbon  " as Lisbon', () => {
    expect(validateTripName('  Lisbon  ')).toEqual({ ok: true, name: 'Lisbon' });
  });

  it('F2.AC2 rejects a name of only spaces with "Enter a trip name."', () => {
    expect(validateTripName('   ')).toEqual({
      ok: false,
      field: 'name',
      message: 'Enter a trip name.',
    });
  });

  it('F2.AC2 rejects an empty name with "Enter a trip name."', () => {
    expect(validateTripName('')).toEqual({
      ok: false,
      field: 'name',
      message: 'Enter a trip name.',
    });
  });
});

describe('F2.AC3 trip name length', () => {
  it('F2.AC3 accepts 100 characters', () => {
    const name = 'a'.repeat(100);
    expect(validateTripName(name)).toEqual({ ok: true, name });
  });

  it('F2.AC3 rejects 101 characters with "Trip name must be 100 characters or fewer."', () => {
    expect(validateTripName('a'.repeat(101))).toEqual({
      ok: false,
      field: 'name',
      message: 'Trip name must be 100 characters or fewer.',
    });
  });

  it('F2.AC3 accepts 100 emoji, counting one per code point', () => {
    const name = '😀'.repeat(100);
    expect(name.length).toBe(200);
    expect(validateTripName(name)).toEqual({ ok: true, name });
  });

  it('F2.AC3 rejects 101 emoji, counting one per code point', () => {
    const result = validateTripName('😀'.repeat(101));
    expect(result).toEqual({
      ok: false,
      field: 'name',
      message: 'Trip name must be 100 characters or fewer.',
    });
  });

  it('F2.AC3 counts the length after trimming', () => {
    const name = 'a'.repeat(100);
    expect(validateTripName(`   ${name}   `)).toEqual({ ok: true, name });
  });
});
