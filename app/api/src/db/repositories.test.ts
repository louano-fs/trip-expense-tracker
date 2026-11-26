import { describe, expect, it } from 'vitest';
import { deleteSession, findSessionByHash, insertSession } from './repositories/sessions.ts';
import { clearThrottle, getThrottle, saveThrottle } from './repositories/throttle.ts';
import {
  EmailTakenError,
  findUserByEmail,
  insertUser,
} from './repositories/users.ts';
import type { Db, RunResult, SqlValue } from './open.ts';

interface Call {
  method: 'exec' | 'run' | 'get' | 'all';
  sql: string;
  params: readonly SqlValue[];
}

/** Fake Db. Records every statement and parameter list; returns canned rows and run results. */
class FakeDb implements Db {
  readonly calls: Call[] = [];
  rows: unknown[] = [];
  runResult: RunResult = { changes: 1, lastInsertRowid: 7 };
  runError: unknown = undefined;

  exec(sql: string): void {
    this.calls.push({ method: 'exec', sql, params: [] });
  }

  run(sql: string, params: readonly SqlValue[] = []): RunResult {
    this.calls.push({ method: 'run', sql, params });
    if (this.runError !== undefined) {
      throw this.runError;
    }
    return this.runResult;
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    this.calls.push({ method: 'get', sql, params });
    return this.rows[0] as T | undefined;
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    this.calls.push({ method: 'all', sql, params });
    return this.rows as T[];
  }

  lastCall(): Call {
    const call = this.calls[this.calls.length - 1];
    if (call === undefined) {
      throw new Error('no call recorded');
    }
    return call;
  }
}

/**
 * Checks that a statement uses one `?` per bound value, that the values are passed as
 * parameters, and that no value was joined into the SQL text.
 */
function expectParameterised(call: Call, values: SqlValue[]): void {
  const placeholders = call.sql.split('?').length - 1;
  expect(placeholders).toBe(values.length);
  expect(call.params).toEqual(values);
  for (const value of values) {
    if (typeof value === 'string') {
      expect(call.sql).not.toContain(value);
    }
  }
}

function sqliteError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const CREATED_AT = '2026-11-24T10:00:00.000Z';
const EXPIRES_AT = '2026-12-24T10:00:00.000Z';

describe('F1.R2 users repository', () => {
  it('F1.R2 insertUser uses ? placeholders and passes email, hash and time as parameters', () => {
    const db = new FakeDb();
    const hash = '$argon2id$v=19$m=19456,t=2,p=1$saltvalue$hashvalue';

    insertUser(db, { email: 'sam@mail.com', passwordHash: hash, createdAt: CREATED_AT });

    expectParameterised(db.lastCall(), ['sam@mail.com', hash, CREATED_AT]);
  });

  it('F1.R2 insertUser returns the new id and the stored email', () => {
    const db = new FakeDb();

    const created = insertUser(db, {
      email: 'sam@mail.com',
      passwordHash: 'hash',
      createdAt: CREATED_AT,
    });

    expect(created).toEqual({ id: 7, email: 'sam@mail.com' });
  });

  it('F1.R4 insertUser maps a unique violation on users.email to EmailTakenError', () => {
    const db = new FakeDb();
    db.runError = sqliteError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: users.email');

    let thrown: unknown;
    try {
      insertUser(db, { email: 'sam@mail.com', passwordHash: 'hash', createdAt: CREATED_AT });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(EmailTakenError);
    expect((thrown as EmailTakenError).code).toBe('EMAIL_TAKEN');
  });

  it('F1.R4 insertUser rethrows other errors unchanged', () => {
    const db = new FakeDb();
    const failure = new Error('disk I/O error');
    db.runError = failure;

    expect(() =>
      insertUser(db, { email: 'sam@mail.com', passwordHash: 'hash', createdAt: CREATED_AT }),
    ).toThrow(failure);
  });

  it('F1.R4 insertUser does not map a unique violation on another table to EmailTakenError', () => {
    const db = new FakeDb();
    const failure = sqliteError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: trips.name');
    db.runError = failure;

    expect(() =>
      insertUser(db, { email: 'sam@mail.com', passwordHash: 'hash', createdAt: CREATED_AT }),
    ).toThrow(failure);
  });

  it('F1.R4 findUserByEmail passes the normalized email as a parameter and maps the row', () => {
    const db = new FakeDb();
    db.rows = [
      { id: 3, email: 'sam@mail.com', password_hash: 'stored-hash', created_at: CREATED_AT },
    ];

    const user = findUserByEmail(db, 'sam@mail.com');

    expectParameterised(db.lastCall(), ['sam@mail.com']);
    expect(user).toEqual({
      id: 3,
      email: 'sam@mail.com',
      passwordHash: 'stored-hash',
      createdAt: CREATED_AT,
    });
  });

  it('F1.R4 findUserByEmail returns undefined when no account exists', () => {
    const db = new FakeDb();

    expect(findUserByEmail(db, 'nobody@mail.com')).toBeUndefined();
  });
});

describe('F1.R7 sessions repository', () => {
  it('F1.R7 insertSession uses ? placeholders and passes every value as a parameter', () => {
    const db = new FakeDb();

    insertSession(db, {
      idHash: 'hash-of-session-id',
      userId: 3,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });

    expectParameterised(db.lastCall(), ['hash-of-session-id', 3, CREATED_AT, EXPIRES_AT]);
  });

  it('F1.R7 findSessionByHash passes the hash as a parameter and maps the row', () => {
    const db = new FakeDb();
    db.rows = [
      {
        id_hash: 'hash-of-session-id',
        user_id: 3,
        created_at: CREATED_AT,
        expires_at: EXPIRES_AT,
      },
    ];

    const session = findSessionByHash(db, 'hash-of-session-id');

    expectParameterised(db.lastCall(), ['hash-of-session-id']);
    expect(session).toEqual({
      idHash: 'hash-of-session-id',
      userId: 3,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
  });

  it('F1.R7 findSessionByHash returns undefined for an unknown hash', () => {
    const db = new FakeDb();

    expect(findSessionByHash(db, 'unknown')).toBeUndefined();
  });

  it('F1.R8 deleteSession uses a ? placeholder and returns true when a row was removed', () => {
    const db = new FakeDb();
    db.runResult = { changes: 1, lastInsertRowid: 0 };

    const removed = deleteSession(db, 'hash-of-session-id');

    expectParameterised(db.lastCall(), ['hash-of-session-id']);
    expect(removed).toBe(true);
  });

  it('F1.R8 deleteSession returns false when no row matched', () => {
    const db = new FakeDb();
    db.runResult = { changes: 0, lastInsertRowid: 0 };

    expect(deleteSession(db, 'missing')).toBe(false);
  });
});

describe('F1.R13 throttle repository', () => {
  it('F1.R13 getThrottle passes the normalized email as a parameter and maps the row', () => {
    const db = new FakeDb();
    db.rows = [
      { email: 'sam@mail.com', consecutive_failures: 6, next_allowed_at: EXPIRES_AT },
    ];

    const state = getThrottle(db, 'sam@mail.com');

    expectParameterised(db.lastCall(), ['sam@mail.com']);
    expect(state).toEqual({
      email: 'sam@mail.com',
      consecutiveFailures: 6,
      nextAllowedAt: EXPIRES_AT,
    });
  });

  it('F1.R13 getThrottle returns undefined when the email has no failures recorded', () => {
    const db = new FakeDb();

    expect(getThrottle(db, 'sam@mail.com')).toBeUndefined();
  });

  it('F1.R13 saveThrottle upserts with ? placeholders and passes null as a parameter', () => {
    const db = new FakeDb();

    saveThrottle(db, { email: 'sam@mail.com', consecutiveFailures: 1, nextAllowedAt: null });

    expectParameterised(db.lastCall(), ['sam@mail.com', 1, null]);
    expect(db.lastCall().sql).toContain('ON CONFLICT (email) DO UPDATE');
  });

  it('F1.R13 clearThrottle deletes by email as a parameter', () => {
    const db = new FakeDb();

    clearThrottle(db, 'sam@mail.com');

    expectParameterised(db.lastCall(), ['sam@mail.com']);
    expect(db.lastCall().sql).toContain('DELETE FROM login_throttle');
  });
});
