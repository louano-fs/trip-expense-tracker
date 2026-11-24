// Session cookie rules (F1.R7). The cookie holds only the opaque session ID, never user data.
import { parse, serialize } from 'cookie';
import { SESSION_LIFETIME_MS } from '../auth/sessions.ts';

/** `__Host-` prefix: browsers require Secure, Path=/ and no Domain for this name (F1.R7). */
export const SESSION_COOKIE_NAME = '__Host-sid';

const SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_MS / 1000;

/**
 * The Set-Cookie value that stores the session ID for 30 days (F1.R7).
 * `expiresAt` is the session's own expiry; the server still checks it on every request.
 * `secure` comes from config. Only the test-only override turns it off.
 */
export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  return serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: expiresAt,
  });
}

/** The Set-Cookie value that removes the session cookie from this browser (F1.R8). */
export function clearSessionCookie(secure: boolean): string {
  return serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

/** Reads the raw session token from a Cookie header. Returns undefined when there is none. */
export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }
  const value = parse(cookieHeader)[SESSION_COOKIE_NAME];
  return value === undefined || value === '' ? undefined : value;
}
