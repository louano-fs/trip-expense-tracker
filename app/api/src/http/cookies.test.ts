import { describe, expect, it } from 'vitest';
import { clearSessionCookie, readSessionToken, sessionCookie } from './cookies.ts';

// These cookie rules come from F1.R7 and have no AC of their own, so the tests use F1.R7.
const EXPIRES_AT = new Date('2026-12-24T10:00:00.000Z');

describe('sessionCookie', () => {
  it('F1.R7 uses the __Host- name and the required attributes', () => {
    const header = sessionCookie('token-value', EXPIRES_AT, true);

    expect(header.startsWith('__Host-sid=token-value;')).toBe(true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
  });

  it('F1.R7 sets Max-Age to 30 days in seconds and Expires to the session expiry', () => {
    const header = sessionCookie('token-value', EXPIRES_AT, true);

    expect(header).toContain('Max-Age=2592000');
    expect(header).toContain(`Expires=${EXPIRES_AT.toUTCString()}`);
  });

  it('F1.R7 leaves out Secure only when config turns it off', () => {
    const header = sessionCookie('token-value', EXPIRES_AT, false);

    expect(header).not.toContain('Secure');
    expect(header).toContain('HttpOnly');
  });
});

describe('clearSessionCookie', () => {
  it('F1.R8 sends an expired cookie with the same name, path and attributes', () => {
    const header = clearSessionCookie(true);

    expect(header.startsWith('__Host-sid=;')).toBe(true);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
  });
});

describe('readSessionToken', () => {
  it('F1.R7 reads the token from the __Host-sid cookie among others', () => {
    expect(readSessionToken('theme=dark; __Host-sid=abc123')).toBe('abc123');
  });

  it('F1.R7 returns undefined when the cookie is missing or empty', () => {
    expect(readSessionToken(undefined)).toBeUndefined();
    expect(readSessionToken('theme=dark')).toBeUndefined();
    expect(readSessionToken('__Host-sid=')).toBeUndefined();
  });
});
