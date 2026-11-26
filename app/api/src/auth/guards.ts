import { resolveSession, type Clock, type SessionStore } from './sessions.ts';

/** The logged-in user the guards hand back. Only the id is known from the session. */
export interface AuthUser {
  id: number;
}

/** Shared inputs for the guards. `token` is the raw session cookie value, if any. */
export interface GuardInput {
  token: string | undefined;
  sessions: SessionStore;
  clock: Clock;
}

export type ApiGuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; status: 401 };

export type PageGuardResult =
  | { ok: true }
  | { redirect: '/login'; notice: 'expired' | undefined };

/** The trip fields the ownership check needs. */
export interface OwnedTrip {
  owner_id: number;
}

/**
 * F1.R10: a trip endpoint needs a live session. Returns the user, or a bare
 * 401 with no data. Runs before the ownership check in every trip endpoint.
 */
export function apiGuard(input: GuardInput): ApiGuardResult {
  const user = currentUser(input);
  if (user === null) {
    return { ok: false, status: 401 };
  }
  return { ok: true, user };
}

/**
 * F1.R9: a trip page needs a live session. With no cookie, redirect to Log in
 * with no notice. With a cookie whose session has ended, redirect with the
 * expired notice.
 */
export function pageGuard(input: GuardInput): PageGuardResult {
  if (input.token === undefined || input.token === '') {
    return { redirect: '/login', notice: undefined };
  }
  const user = currentUser(input);
  if (user === null) {
    return { redirect: '/login', notice: 'expired' };
  }
  return { ok: true };
}

/**
 * F1.R11: the trip's owner must be the logged-in user. A trip owned by someone
 * else and a trip that does not exist both give 'not-found'.
 */
export function ownsTrip(trip: OwnedTrip | undefined, userId: number): 'ok' | 'not-found' {
  if (trip === undefined || trip.owner_id !== userId) {
    return 'not-found';
  }
  return 'ok';
}

function currentUser(input: GuardInput): AuthUser | null {
  if (input.token === undefined || input.token === '') {
    return null;
  }
  const session = resolveSession({
    token: input.token,
    store: input.sessions,
    clock: input.clock,
  });
  if (session === null) {
    return null;
  }
  return { id: session.userId };
}
