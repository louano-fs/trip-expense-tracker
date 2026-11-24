import type { ThrottleState } from '../db/repositories/throttle.ts';
import type { Clock } from './sessions.ts';
import { normalizeEmail } from './validation.ts';

/** Failures allowed with no wait (F1.R13). */
const FREE_FAILURES = 5;
/** Wait after the 5th consecutive failure, in seconds (F1.R13). */
const FIRST_WAIT_SECONDS = 30;
/** Longest wait allowed, in seconds (F1.R13). */
const MAX_WAIT_SECONDS = 3600;

export type ThrottleDecision = { allowed: true } | { allowed: false; waitSeconds: number };

/** Where throttle state is kept. The real adapter wraps the throttle repository (F1.R13). */
export interface ThrottleStore {
  get(email: string): ThrottleState | undefined;
  save(state: ThrottleState): void;
}

/** Pure: whether a login attempt may proceed now, given the stored state. */
export function throttleDecision(state: ThrottleState, now: Date): ThrottleDecision {
  if (state.consecutiveFailures < FREE_FAILURES || state.nextAllowedAt === null) {
    return { allowed: true };
  }
  const nextMs = Date.parse(state.nextAllowedAt);
  if (Number.isNaN(nextMs)) {
    throw new Error('Throttle state has an invalid next_allowed_at');
  }
  const nowMs = now.getTime();
  if (nowMs >= nextMs) {
    return { allowed: true };
  }
  return { allowed: false, waitSeconds: Math.ceil((nextMs - nowMs) / 1000) };
}

/** Pure: the state after one more failed login. Waits start at the 5th failure (F1.AC20). */
export function recordFailure(state: ThrottleState, now: Date): ThrottleState {
  const count = state.consecutiveFailures + 1;
  let nextAllowedAt: string | null = null;
  if (count >= FREE_FAILURES) {
    const waitSeconds = Math.min(FIRST_WAIT_SECONDS * 2 ** (count - FREE_FAILURES), MAX_WAIT_SECONDS);
    nextAllowedAt = new Date(now.getTime() + waitSeconds * 1000).toISOString();
  }
  return { email: state.email, consecutiveFailures: count, nextAllowedAt };
}

/** Pure: the state after a successful login (F1.AC21). */
export function recordSuccess(state: ThrottleState): ThrottleState {
  return { email: state.email, consecutiveFailures: 0, nextAllowedAt: null };
}

export interface LoginThrottleDeps {
  store: ThrottleStore;
  clock: Clock;
}

export interface LoginThrottle {
  check(email: string): ThrottleDecision;
  recordFailure(email: string): void;
  recordSuccess(email: string): void;
}

/**
 * Login throttle keyed by the normalized email. Unknown and known emails go through
 * the same path, so the result does not reveal whether an account exists (F1.AC22).
 */
export function createLoginThrottle({ store, clock }: LoginThrottleDeps): LoginThrottle {
  function load(email: string): ThrottleState {
    const key = normalizeEmail(email);
    return store.get(key) ?? { email: key, consecutiveFailures: 0, nextAllowedAt: null };
  }

  return {
    check(email) {
      return throttleDecision(load(email), clock.now());
    },
    recordFailure(email) {
      store.save(recordFailure(load(email), clock.now()));
    },
    recordSuccess(email) {
      store.save(recordSuccess(load(email)));
    },
  };
}
