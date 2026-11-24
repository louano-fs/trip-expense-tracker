// Login service (F1.R6, F1.R13). Plain function: all I/O comes in through deps.
import type { UserRecord } from '../db/repositories/users.ts';
import { DUMMY_HASH } from './password.ts';
import { userView, type UserView } from './responses.ts';
import { startSession, type Clock, type RandomSource, type SessionStore } from './sessions.ts';
import type { LoginThrottle } from './throttle.ts';
import { normalizeEmail } from './validation.ts';

// Copy from docs/specs/features/F1-registration-and-login.md, "States & errors".
export const LOGIN_MESSAGES = {
  wrongCredentials: 'Email or password is incorrect.',
} as const;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * The remaining wait as the spec words it, rounded up: "30 seconds", "2 minutes", "1 hour" (F1.R13).
 * The longest wait is 1 hour, so minutes never go past 60.
 */
export function formatWait(waitSeconds: number): string {
  if (waitSeconds < 60) {
    return plural(waitSeconds, 'second');
  }
  const minutes = Math.ceil(waitSeconds / 60);
  if (minutes >= 60) {
    return '1 hour';
  }
  return plural(minutes, 'minute');
}

/** Copy for a refused login during a wait (F1.R13). */
export function throttledMessage(waitSeconds: number): string {
  return `Too many failed attempts. Try again in ${formatWait(waitSeconds)}.`;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Finds a user by normalized email. The real adapter wraps findUserByEmail. */
export interface LoginUserStore {
  findByEmail(email: string): UserRecord | undefined;
}

/** Checks a typed password against a stored hash. The real one is verifyPassword in password.ts. */
export type PasswordVerifier = (stored: string, password: string) => Promise<boolean>;

export interface LoginDeps {
  users: LoginUserStore;
  sessions: SessionStore;
  throttle: LoginThrottle;
  verifyPassword: PasswordVerifier;
  clock: Clock;
  random: RandomSource;
  /** Runs the work in one database transaction; the work is synchronous. */
  transaction: <T>(work: () => T) => T;
}

export type LoginResult =
  | { ok: true; user: UserView; token: string; expiresAt: Date }
  | { ok: false; status: 401; message: typeof LOGIN_MESSAGES.wrongCredentials }
  | { ok: false; status: 429; retryAfterSeconds: number; message: string };

/**
 * Logs a user in and starts a session (F1.AC5, F1.AC6, F1.AC12, F1.R13).
 * A wrong password and an unknown email give the same 401 result and start no session.
 * During a wait the request is refused with 429 before the password is checked, and it
 * does not change the failure count. The password and hash are never logged or returned.
 */
export async function login(input: LoginInput, deps: LoginDeps): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  const decision = deps.throttle.check(email);
  if (!decision.allowed) {
    return {
      ok: false,
      status: 429,
      retryAfterSeconds: decision.waitSeconds,
      message: throttledMessage(decision.waitSeconds),
    };
  }

  const user = deps.users.findByEmail(email);
  // An unknown email is checked against a placeholder hash, so both paths do the same hashing work.
  const passwordMatches = await deps.verifyPassword(user?.passwordHash ?? DUMMY_HASH, input.password);
  if (user === undefined || !passwordMatches) {
    deps.throttle.recordFailure(email);
    return { ok: false, status: 401, message: LOGIN_MESSAGES.wrongCredentials };
  }

  // The throttle reset and the session row are written in one transaction (project rules).
  const session = deps.transaction(() => {
    deps.throttle.recordSuccess(email);
    return startSession({
      userId: user.id,
      store: deps.sessions,
      clock: deps.clock,
      random: deps.random,
    });
  });
  return { ok: true, user: userView(user), token: session.token, expiresAt: session.expiresAt };
}
