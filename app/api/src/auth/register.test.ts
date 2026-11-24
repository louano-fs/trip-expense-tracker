import { describe, expect, it } from 'vitest';
import type { NewSession, SessionRecord } from '../db/repositories/sessions.ts';
import { EmailTakenError, type NewUser } from '../db/repositories/users.ts';
import { buildBlocklist, STARTER_BLOCKLIST } from './blocklist.ts';
import {
  register,
  TRIPS_PATH,
  type RegisterDeps,
  type RegisterResult,
} from './register.ts';
import {
  hashSessionToken,
  type Clock,
  type RandomSource,
  type SessionStore,
} from './sessions.ts';

const NOW = '2026-11-24T09:00:00.000Z';
const GOOD_PASSWORD = 'correct-horse-staple-42';

const MSG_PASSWORD_SHORT =
  'Password must be at least 15 characters. A short phrase is easy to remember.';
const MSG_PASSWORD_LONG = 'Password must be 128 characters or fewer.';
const MSG_PASSWORD_COMMON =
  'This password is too common or easy to guess. Choose a different one.';
const MSG_EMAIL_INVALID = 'Enter a valid email address, like name@example.com.';
const MSG_EMAIL_TAKEN = 'An account with this email already exists. Log in instead.';

interface StoredUser {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

// Fake user store. Records every insert call and keeps rows keyed by email, so a
// duplicate throws EmailTakenError the same way the real unique index does.
function fakeUsers() {
  const rows: StoredUser[] = [];
  const insertCalls: NewUser[] = [];
  const store: RegisterDeps['users'] = {
    insert(user: NewUser) {
      insertCalls.push({ ...user });
      if (rows.some((row) => row.email === user.email)) {
        throw new EmailTakenError();
      }
      const row: StoredUser = { id: rows.length + 1, ...user };
      rows.push(row);
      return { id: row.id, email: row.email };
    },
  };
  return { store, rows, insertCalls };
}

// Fake hasher. Returns a fixed marker that is not the input, and records its calls.
function fakeHasher() {
  const calls: string[] = [];
  const hashPassword = async (password: string): Promise<string> => {
    calls.push(password);
    return `fake-argon2id:${password.length}`;
  };
  return { hashPassword, calls };
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

function fixedClock(iso: string): Clock {
  const time = Date.parse(iso);
  return { now: () => new Date(time) };
}

function fixedRandom(): RandomSource {
  return (size: number) => new Uint8Array(size).fill(7);
}

function makeDeps() {
  const users = fakeUsers();
  const hasher = fakeHasher();
  const sessions = fakeSessions();
  let transactionRuns = 0;
  const deps: RegisterDeps = {
    users: users.store,
    sessions: sessions.store,
    hashPassword: hasher.hashPassword,
    blocklist: buildBlocklist(STARTER_BLOCKLIST),
    clock: fixedClock(NOW),
    random: fixedRandom(),
    transaction: <T>(work: () => T): T => {
      transactionRuns += 1;
      return work();
    },
  };
  return {
    deps,
    users,
    hasher,
    sessions,
    transactions: () => transactionRuns,
  };
}

type Success = Extract<RegisterResult, { ok: true }>;
type Failure = Extract<RegisterResult, { ok: false }>;

function successOf(result: RegisterResult): Success {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.status} ${result.message}`);
  }
  return result;
}

function failureOf(result: RegisterResult): Failure {
  if (result.ok) {
    throw new Error('expected a failure, got success');
  }
  return result;
}

describe('F1.AC1 a valid registration creates an account and logs the visitor in', () => {
  it('F1.AC1 stores only the password hash, never the password', async () => {
    const { deps, users, hasher } = makeDeps();

    const result = successOf(
      await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps),
    );

    expect(hasher.calls).toEqual([GOOD_PASSWORD]);
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]?.passwordHash).toBe(`fake-argon2id:${GOOD_PASSWORD.length}`);
    expect(users.rows[0]?.passwordHash).not.toBe(GOOD_PASSWORD);
    expect(users.rows[0]?.passwordHash).not.toContain(GOOD_PASSWORD);
    expect(result.user).toEqual({ id: 1, email: 'sam@mail.com' });
  });

  it('F1.AC1 starts a session for the new user and returns its token', async () => {
    const { deps, sessions } = makeDeps();

    const result = successOf(
      await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps),
    );

    expect(result.token).toBe(Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'));
    expect(sessions.rows.size).toBe(1);
    const session = sessions.rows.get(hashSessionToken(result.token));
    expect(session?.userId).toBe(result.user.id);
    expect(session?.createdAt).toBe(NOW);
  });

  it('F1.AC1 sends the new user to the Trips screen', async () => {
    const { deps } = makeDeps();

    const result = successOf(
      await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps),
    );

    expect(result.redirectTo).toBe(TRIPS_PATH);
    expect(TRIPS_PATH).toBe('/trips');
  });

  it('F1.AC1 writes the user and the session in one transaction', async () => {
    const { deps, transactions } = makeDeps();

    successOf(await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps));

    expect(transactions()).toBe(1);
  });

  it('F1.AC12 the register response user holds only id and email', async () => {
    const { deps } = makeDeps();

    const result = successOf(
      await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps),
    );

    expect(Object.keys(result.user).sort()).toEqual(['email', 'id']);
    expect(JSON.stringify(result)).not.toContain('password_hash');
    expect(JSON.stringify(result)).not.toContain(`fake-argon2id:${GOOD_PASSWORD.length}`);
  });
});

describe('F1.AC2 a registration with an email already in use is rejected', () => {
  it('F1.AC2 rejects a second registration that differs only in case and surrounding spaces', async () => {
    const { deps, users, sessions } = makeDeps();
    successOf(await register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps));

    const result = failureOf(
      await register({ email: '  SAM@Mail.com ', password: GOOD_PASSWORD }, deps),
    );

    expect(result).toEqual({
      ok: false,
      status: 409,
      field: 'email',
      message: MSG_EMAIL_TAKEN,
    });
    expect(users.rows).toHaveLength(1);
    expect(sessions.rows.size).toBe(1);
  });

  it('F1.R4 passes on store errors other than a taken email', async () => {
    const { deps } = makeDeps();
    deps.users = {
      insert() {
        throw new Error('disk unavailable');
      },
    };

    await expect(
      register({ email: 'sam@mail.com', password: GOOD_PASSWORD }, deps),
    ).rejects.toThrow('disk unavailable');
  });
});

describe('F1.AC3 password length of 15 to 128 characters', () => {
  it('F1.AC3 rejects a 14-character password with the at-least-15 message and creates no user', async () => {
    const { deps, users, hasher } = makeDeps();

    const result = failureOf(await register({ email: 'sam@mail.com', password: 'a'.repeat(14) }, deps));

    expect(result).toEqual({
      ok: false,
      status: 400,
      field: 'password',
      message: MSG_PASSWORD_SHORT,
    });
    expect(users.insertCalls).toHaveLength(0);
    expect(hasher.calls).toHaveLength(0);
  });

  it('F1.AC3 accepts a 15-character password', async () => {
    const { deps, users } = makeDeps();

    successOf(await register({ email: 'sam@mail.com', password: 'a'.repeat(15) }, deps));

    expect(users.rows).toHaveLength(1);
  });
});

describe('F1.AC4 email format and length', () => {
  it('F1.AC4 rejects an email without an @ sign and creates no user', async () => {
    const { deps, users } = makeDeps();

    const result = failureOf(await register({ email: 'sam.mail.com', password: GOOD_PASSWORD }, deps));

    expect(result).toEqual({ ok: false, status: 400, field: 'email', message: MSG_EMAIL_INVALID });
    expect(users.insertCalls).toHaveLength(0);
  });

  it('F1.AC4 rejects an email without a domain and creates no user', async () => {
    const { deps, users } = makeDeps();

    const result = failureOf(await register({ email: 'sam@', password: GOOD_PASSWORD }, deps));

    expect(result).toEqual({ ok: false, status: 400, field: 'email', message: MSG_EMAIL_INVALID });
    expect(users.insertCalls).toHaveLength(0);
  });

  it('F1.AC4 rejects an email longer than 254 characters and creates no user', async () => {
    const { deps, users } = makeDeps();
    const longEmail = `${'a'.repeat(246)}@mail.com`;
    expect(longEmail).toHaveLength(255);

    const result = failureOf(await register({ email: longEmail, password: GOOD_PASSWORD }, deps));

    expect(result).toEqual({ ok: false, status: 400, field: 'email', message: MSG_EMAIL_INVALID });
    expect(users.insertCalls).toHaveLength(0);
  });

  it('F1.AC4 accepts an email of exactly 254 characters', async () => {
    const { deps, users } = makeDeps();
    const email = `${'a'.repeat(245)}@mail.com`;
    expect(email).toHaveLength(254);

    successOf(await register({ email, password: GOOD_PASSWORD }, deps));

    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]?.email).toBe(email);
  });
});

describe('F1.AC16 password of 128 characters or fewer', () => {
  it('F1.AC16 rejects a 129-character password with the 128-or-fewer message and creates no user', async () => {
    const { deps, users, hasher } = makeDeps();

    const result = failureOf(await register({ email: 'sam@mail.com', password: 'a'.repeat(129) }, deps));

    expect(result).toEqual({
      ok: false,
      status: 400,
      field: 'password',
      message: MSG_PASSWORD_LONG,
    });
    expect(users.insertCalls).toHaveLength(0);
    expect(hasher.calls).toHaveLength(0);
  });

  it('F1.AC16 accepts a 128-character password', async () => {
    const { deps, users } = makeDeps();

    successOf(await register({ email: 'sam@mail.com', password: 'a'.repeat(128) }, deps));

    expect(users.rows).toHaveLength(1);
  });
});

describe('F1.AC17 blocklisted passwords are rejected', () => {
  it('F1.AC17 rejects a listed password in any letter case and creates no user', async () => {
    const { deps, users } = makeDeps();

    const result = failureOf(await register({ email: 'sam@mail.com', password: 'PASSWORD1234567' }, deps));

    expect(result).toEqual({
      ok: false,
      status: 400,
      field: 'password',
      message: MSG_PASSWORD_COMMON,
    });
    expect(users.insertCalls).toHaveLength(0);
  });

  it('F1.AC17 rejects a password equal to the email address and creates no user', async () => {
    const { deps, users } = makeDeps();
    const email = 'Sam.LongName.2026@Mail.com';

    const result = failureOf(await register({ email, password: email }, deps));

    expect(result).toEqual({
      ok: false,
      status: 400,
      field: 'password',
      message: MSG_PASSWORD_COMMON,
    });
    expect(users.insertCalls).toHaveLength(0);
  });

  it('F1.AC17 rejects a password equal to the part of the email before @ and creates no user', async () => {
    const { deps, users } = makeDeps();

    const result = failureOf(
      await register({ email: 'sam.longname.2026@mail.com', password: 'Sam.LongName.2026' }, deps),
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      field: 'password',
      message: MSG_PASSWORD_COMMON,
    });
    expect(users.insertCalls).toHaveLength(0);
  });
});
