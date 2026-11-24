// Registration service (F1.R1 to F1.R5, F1.R12). Plain function: all I/O comes in through deps.
import { EmailTakenError, type NewUser } from '../db/repositories/users.ts';
import { isBlockedPassword, type Blocklist } from './blocklist.ts';
import { createSession, type Clock, type RandomSource, type SessionStore } from './sessions.ts';
import { normalizeEmail, validateEmail, validatePasswordLength } from './validation.ts';

/** Where a successful registration sends the user (F1.R5). */
export const TRIPS_PATH = '/trips';

// Copy from docs/specs/features/F1-registration-and-login.md, "States & errors".
export const REGISTER_MESSAGES = {
  passwordTooCommon: 'This password is too common or easy to guess. Choose a different one.',
  emailTaken: 'An account with this email already exists. Log in instead.',
} as const;

export interface RegisterInput {
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: number;
  email: string;
}

/** Stores the new user. Throws EmailTakenError when the email is already in use (F1.R4). */
export interface RegisterUserStore {
  insert(user: NewUser): RegisteredUser;
}

export type PasswordHasher = (password: string) => Promise<string>;

export interface RegisterDeps {
  users: RegisterUserStore;
  sessions: SessionStore;
  hashPassword: PasswordHasher;
  blocklist: Blocklist;
  clock: Clock;
  random: RandomSource;
  /** Runs the work in one database transaction; the work is synchronous. */
  transaction: <T>(work: () => T) => T;
}

export type RegisterResult =
  | { ok: true; user: RegisteredUser; token: string; redirectTo: typeof TRIPS_PATH }
  | { ok: false; status: 400; field: 'email' | 'password'; message: string }
  | { ok: false; status: 409; field: 'email'; message: string };

/**
 * Registers a new account and starts its session (F1.AC1 to F1.AC4, F1.AC16, F1.AC17).
 * Field errors return 400 and write nothing. A taken email returns 409 and writes nothing.
 * The password and hash are never logged or returned.
 */
export async function register(input: RegisterInput, deps: RegisterDeps): Promise<RegisterResult> {
  const emailCheck = validateEmail(normalizeEmail(input.email));
  if (!emailCheck.ok) {
    return { ok: false, status: 400, field: 'email', message: emailCheck.message };
  }

  const passwordCheck = validatePasswordLength(input.password);
  if (!passwordCheck.ok) {
    return { ok: false, status: 400, field: 'password', message: passwordCheck.message };
  }

  if (isBlockedPassword(passwordCheck.password, emailCheck.email, deps.blocklist)) {
    return {
      ok: false,
      status: 400,
      field: 'password',
      message: REGISTER_MESSAGES.passwordTooCommon,
    };
  }

  const passwordHash = await deps.hashPassword(passwordCheck.password);

  try {
    // The user row and the session row are written in one transaction (project rules).
    const created = deps.transaction(() => {
      const user = deps.users.insert({
        email: emailCheck.email,
        passwordHash,
        createdAt: deps.clock.now().toISOString(),
      });
      const token = createSession({
        userId: user.id,
        store: deps.sessions,
        clock: deps.clock,
        random: deps.random,
      });
      return { user, token };
    });
    return { ok: true, user: created.user, token: created.token, redirectTo: TRIPS_PATH };
  } catch (err: unknown) {
    if (err instanceof EmailTakenError) {
      return { ok: false, status: 409, field: 'email', message: REGISTER_MESSAGES.emailTaken };
    }
    throw err;
  }
}
