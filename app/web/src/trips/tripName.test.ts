import { describe, expect, it } from 'vitest';
import { checkTripName } from './tripName';

describe('checkTripName', () => {
  it('F2.AC2 trims spaces at both ends: "  Lisbon  " is accepted as Lisbon', () => {
    expect(checkTripName('  Lisbon  ')).toEqual({ ok: true, name: 'Lisbon' });
  });

  it('F2.AC2 rejects a name of only spaces with "Enter a trip name."', () => {
    expect(checkTripName('     ')).toEqual({ ok: false, message: 'Enter a trip name.' });
  });

  it('F2.AC2 rejects an empty name with "Enter a trip name."', () => {
    expect(checkTripName('')).toEqual({ ok: false, message: 'Enter a trip name.' });
  });

  it('F2.R2 keeps spaces inside the name as typed', () => {
    expect(checkTripName(' Ski   weekend ')).toEqual({ ok: true, name: 'Ski   weekend' });
  });

  it('F2.AC3 accepts a name of exactly 100 characters', () => {
    const name = 'a'.repeat(100);
    expect(checkTripName(name)).toEqual({ ok: true, name });
  });

  it('F2.AC3 rejects a name of 101 characters with "Trip name must be 100 characters or fewer."', () => {
    expect(checkTripName('a'.repeat(101))).toEqual({
      ok: false,
      message: 'Trip name must be 100 characters or fewer.',
    });
  });

  it('F2.AC3 counts each emoji as one character, so 100 emoji are accepted and 101 are rejected', () => {
    expect(checkTripName('😀'.repeat(100))).toEqual({ ok: true, name: '😀'.repeat(100) });
    expect(checkTripName('😀'.repeat(101)).ok).toBe(false);
  });

  it('F2.AC3 checks the length after trimming, so 100 characters with spaces around them are accepted', () => {
    const name = 'b'.repeat(100);
    expect(checkTripName(`  ${name}  `)).toEqual({ ok: true, name });
  });
});
