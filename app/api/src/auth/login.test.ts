import { describe, expect, it } from 'vitest';
import type { NewSession, SessionRecord } from '../db/repositories/sessions.ts';
import type { UserRecord } from '../db/repositories/users.ts';
import { DUMMY_HASH } from './password.ts';
import {
  formatWait,
  login,
  LOGIN_MESSAGES,
  type LoginDeps,
  type LoginResult,
  type PasswordVerifier,
} from './login.ts';
import { userView } from './responses.ts';
import { hashSessionToken, type Clock, type RandomSource, type SessionStore } from './sessions.ts';
import { createLoginThrottle, type ThrottleStore } from './throttle.ts';
import type { ThrottleState } from '../db/repositories/throttle.ts';

const START = '2026-11-24T09:00:00.000Z';
const PASSWORD = 'correct-horse-staple-42';
const WRONG_PASSWORD = 'wrong-horse-staple-42';
const STORED_HASH = `fake-argon2id:${PASSWORD}`;

const MSG_WRONG = 'Email or password is incorrect.';

// Fake user store. Rows are keyed by the normalized email, as the real unique index keeps them.
function fakeUsers(rows: UserRecord[]) {
  return {
    findByEmail(email: string): UserRecord | undefined {
      return rows.find((row) => row.email === email);
    },
  };
}

// Fake verifier. Returns true only when the stored value is the fake hash of the typed password.
// It records every call so tests can check which hash was compared.
function fakeVerifier() {
  const calls: { stored: string; password: string }[] = [];
  const verifyPassword: PasswordVerifier = async (stored, password) => {
    calls.push({ stored, password });
    return stored === `fake-argon2id:${password}`;
  };
  return { verifyPassword, calls };
}

// In-memory session store keyed by id hash.
function fakeSessions() {
  const rows = new Map<string, SessionRecord>();
  const store: SessionStore = {
    insert(session: NewSession) {
      rows.set(session.idHash, { ...session });
    },
    findByHash(idHash: string) {
      return rows.get(idHash);
    },
    delete(idHash: string) {
      return rows.delete(idHash);
    },
  };
  return { store, rows };
}

// In-memory throttle store keyed by email.
function fakeThrottleStore() {
  const rows = new Map<string, ThrottleState>();
  const store: ThrottleStore = {
    get(email: string) {
      return rows.get(email);
    },
    save(state: ThrottleState) {
      rows.set(state.email, { ...state });
    },
  };
  return { store, rows };
}

// A fixed clock that the test moves on purpose. It never reads the real time.
function movableClock(iso: string) {
  let time = Date.parse(iso);
  const clock: Clock & { set(iso: string): void; advance(seconds: number): void } = {
    now: () => new Date(time),
    set(next: string) {
      time = Date.parse(next);
    },
    advance(seconds: number) {
      time += seconds * 1000;
    },
  };
  return clock;
}

function fixedRandom(): RandomSource {
  return (size: number) => new Uint8Array(size).fill(7);
}

function makeDeps() {
  const storedUser: UserRecord = {
    id: 1,
    email: 'sam@mail.com',
    passwordHash: STORED_HASH,
    createdAt: START,
  };
  const verifier = fakeVerifier();
  const sessions = fakeSessions();
  const throttleStore = fakeThrottleStore();
  const clock = movableClock(START);
  let transactionRuns = 0;
  const deps: LoginDeps = {
    users: fakeUsers([storedUser]),
    sessions: sessions.store,
    throttle: createLoginThrottle({ store: throttleStore.store, clock }),
    verifyPassword: verifier.verifyPassword,
    clock,
    random: fixedRandom(),
    transaction: <T>(work: () => T): T => {
      transactionRuns += 1;
      return work();
    },
  };
  return {
    deps,
    verifier,
    sessions,
    throttleRows: throttleStore.rows,
    clock,
    transactions: () => transactionRuns,
  };
}

type Success = Extract<LoginResult, { ok: true }>;
type Failure = Extract<LoginResult, { ok: false }>;

function successOf(result: LoginResult): Success {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.status} ${result.message}`);
  }
  return result;
}

function failureOf(result: LoginResult): Failure {
  if (result.ok) {
    throw new Error('expected a failure, got success');
  }
  return result;
}

// Sends `count` wrong-password attempts for the same email at the current clock time.
async function failTimes(deps: LoginDeps, count: number, email = 'sam@mail.com'): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await login({ email, password: WRONG_PASSWORD }, deps);
  }
}

describe('F1.AC5 a correct email and password logs the user in', () => {
  it('F1.AC5 logs in with SAM@mail.com when the account is stored as sam@mail.com', async () => {
    const { deps, sessions } = makeDeps();

    const result = successOf(await login({ email: 'SAM@mail.com', password: PASSWORD }, deps));

    expect(result.user).toEqual({ id: 1, email: 'sam@mail.com' });
    expect(result.token).toBe(Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'));
    expect(sessions.rows.size).toBe(1);
    expect(sessions.rows.get(hashSessionToken(result.token))?.userId).toBe(1);
  });

  it('F1.AC5 a correct login resets the failure count to zero', async () => {
    const { deps, throttleRows } = makeDeps();
    await failTimes(deps, 2);
    expect(throttleRows.get('sam@mail.com')?.consecutiveFailures).toBe(2);

    successOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(throttleRows.get('sam@mail.com')).toEqual({
      email: 'sam@mail.com',
      consecutiveFailures: 0,
      nextAllowedAt: null,
    });
  });

  it('F1.AC5 writes the throttle reset and the session in one transaction', async () => {
    const { deps, transactions } = makeDeps();

    successOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(transactions()).toBe(1);
  });
});

describe('F1.AC6 wrong password or unknown email gives the same general failure', () => {
  it('F1.AC6 returns the general 401 and starts no session for a wrong password', async () => {
    const { deps, sessions } = makeDeps();

    const result = failureOf(await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps));

    expect(result).toEqual({ ok: false, status: 401, message: MSG_WRONG });
    expect(sessions.rows.size).toBe(0);
  });

  it('F1.AC6 returns the same general 401 and starts no session for an unknown email', async () => {
    const { deps, sessions } = makeDeps();

    const result = failureOf(await login({ email: 'nobody@mail.com', password: PASSWORD }, deps));

    expect(result).toEqual({ ok: false, status: 401, message: MSG_WRONG });
    expect(sessions.rows.size).toBe(0);
  });

  it('F1.AC6 the wrong-password and unknown-email results are identical objects', async () => {
    const { deps } = makeDeps();

    const wrongPassword = await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps);
    const unknownEmail = await login({ email: 'nobody@mail.com', password: PASSWORD }, deps);

    expect(unknownEmail).toEqual(wrongPassword);
    expect(LOGIN_MESSAGES.wrongCredentials).toBe(MSG_WRONG);
  });

  it('F1.AC6 calls verifyPassword in both the wrong-password and unknown-email cases', async () => {
    const { deps, verifier } = makeDeps();

    await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps);
    await login({ email: 'nobody@mail.com', password: PASSWORD }, deps);

    expect(verifier.calls).toHaveLength(2);
    expect(verifier.calls[0]).toEqual({ stored: STORED_HASH, password: WRONG_PASSWORD });
    expect(verifier.calls[1]).toEqual({ stored: DUMMY_HASH, password: PASSWORD });
  });

  it('F1.AC6 counts a wrong password as a failure, and an unknown email too', async () => {
    const { deps, throttleRows } = makeDeps();

    await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps);
    await login({ email: 'nobody@mail.com', password: PASSWORD }, deps);

    expect(throttleRows.get('sam@mail.com')?.consecutiveFailures).toBe(1);
    expect(throttleRows.get('nobody@mail.com')?.consecutiveFailures).toBe(1);
  });

  it('F1.AC6 a correct password for an unknown email is still refused', async () => {
    const { deps, sessions } = makeDeps();

    const result = failureOf(await login({ email: 'nobody@mail.com', password: PASSWORD }, deps));

    expect(result.status).toBe(401);
    expect(sessions.rows.size).toBe(0);
  });
});

describe('F1.AC6 a refused login during a wait does not check the password', () => {
  it('F1.AC6 returns 429 for a correct password during a wait, without verifying it', async () => {
    const { deps, verifier, sessions } = makeDeps();
    await failTimes(deps, 5);
    const callsBeforeWait = verifier.calls.length;

    const result = failureOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(result).toEqual({
      ok: false,
      status: 429,
      retryAfterSeconds: 30,
      message: 'Too many failed attempts. Try again in 30 seconds.',
    });
    expect(verifier.calls).toHaveLength(callsBeforeWait);
    expect(sessions.rows.size).toBe(0);
  });

  it('F1.AC6 a correct password during a wait does not reset the failure count', async () => {
    const { deps, throttleRows } = makeDeps();
    await failTimes(deps, 5);
    const before = throttleRows.get('sam@mail.com');

    failureOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(throttleRows.get('sam@mail.com')).toEqual(before);
    expect(throttleRows.get('sam@mail.com')?.consecutiveFailures).toBe(5);
  });

  it('F1.AC6 a refused attempt during a wait does not add to the failure count', async () => {
    const { deps, throttleRows } = makeDeps();
    await failTimes(deps, 5);

    failureOf(await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps));

    expect(throttleRows.get('sam@mail.com')?.consecutiveFailures).toBe(5);
  });

  it('F1.AC19 shows the remaining wait, rounded up, as the retry time', async () => {
    const { deps, clock } = makeDeps();
    await failTimes(deps, 5);
    clock.advance(10);

    const result = failureOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(result.status).toBe(429);
    if (result.status === 429) {
      expect(result.retryAfterSeconds).toBe(20);
      expect(result.message).toBe('Too many failed attempts. Try again in 20 seconds.');
    }
  });

  it('F1.AC19 allows the correct password once the wait has passed', async () => {
    const { deps, clock } = makeDeps();
    await failTimes(deps, 5);
    clock.advance(30);

    const result = successOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(result.user.email).toBe('sam@mail.com');
  });
});

describe('F1.AC12 the login response holds no password fields', () => {
  it('F1.AC12 the login user holds only id and email', async () => {
    const { deps } = makeDeps();

    const result = successOf(await login({ email: 'sam@mail.com', password: PASSWORD }, deps));

    expect(Object.keys(result.user).sort()).toEqual(['email', 'id']);
    expect(result.user).toEqual(userView({ id: 1, email: 'sam@mail.com' }));
    expect(JSON.stringify(result)).not.toMatch(/"password/);
    expect(JSON.stringify(result)).not.toContain(STORED_HASH);
  });

  it('F1.AC12 the failure responses hold no password fields', async () => {
    const { deps } = makeDeps();

    const wrong = await login({ email: 'sam@mail.com', password: WRONG_PASSWORD }, deps);

    // Checks for key names only: the message text itself contains the word "password".
    expect(JSON.stringify(wrong)).not.toMatch(/"password/);
    expect(JSON.stringify(wrong)).not.toContain(STORED_HASH);
  });
});

describe('F1.AC19 wait text as the spec words it', () => {
  it('F1.AC19 formats seconds, minutes and hours, rounding up', () => {
    expect(formatWait(1)).toBe('1 second');
    expect(formatWait(30)).toBe('30 seconds');
    expect(formatWait(59)).toBe('59 seconds');
    expect(formatWait(60)).toBe('1 minute');
    expect(formatWait(89)).toBe('2 minutes');
    expect(formatWait(120)).toBe('2 minutes');
    expect(formatWait(3599)).toBe('1 hour');
    expect(formatWait(3600)).toBe('1 hour');
  });
});
