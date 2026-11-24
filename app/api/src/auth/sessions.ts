import { createHash } from 'node:crypto';
import type { NewSession, SessionRecord } from '../db/repositories/sessions.ts';

/** F1.R7: a session lasts 30 days from login, whatever the activity. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Returns the current time. Injected so tests never use the real clock. */
export interface Clock {
  now(): Date;
}

/** Returns `size` random bytes. Injected so tests can fix the token. */
export type RandomSource = (size: number) => Uint8Array;

/**
 * The storage the session rules need. The real store wraps the session
 * repository functions; tests pass an in-memory fake.
 */
export interface SessionStore {
  insert(session: NewSession): void;
  findByHash(idHash: string): SessionRecord | undefined;
  /** Returns true when a record was removed. */
  delete(idHash: string): boolean;
}

/** SHA-256 hex of the raw token. Only this hash is stored; the token stays in the cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Starts a session for a user. Returns the raw token for the cookie.
 * Stores only its hash, with created and expiry times in UTC.
 */
export function createSession(options: {
  userId: number;
  store: SessionStore;
  clock: Clock;
  random: RandomSource;
}): string {
  const { userId, store, clock, random } = options;
  const token = Buffer.from(random(32)).toString('base64url');
  const createdAt = clock.now();
  const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
  store.insert({
    idHash: hashSessionToken(token),
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return token;
}

/**
 * Finds the live session for a cookie token. Returns null when there is no
 * such session or it has expired. An expired record is deleted.
 */
export function resolveSession(options: {
  token: string;
  store: SessionStore;
  clock: Clock;
}): SessionRecord | null {
  const { token, store, clock } = options;
  const idHash = hashSessionToken(token);
  const session = store.findByHash(idHash);
  if (session === undefined) {
    return null;
  }
  if (clock.now().getTime() >= Date.parse(session.expiresAt)) {
    store.delete(idHash);
    return null;
  }
  return session;
}

/** Ends the session for this token only. Other sessions are not touched. */
export function endSession(options: { token: string; store: SessionStore }): boolean {
  return options.store.delete(hashSessionToken(options.token));
}
