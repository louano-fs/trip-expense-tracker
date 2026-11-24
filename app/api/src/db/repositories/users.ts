import type { Db } from '../open.ts';

/** Thrown when the email already has an account. Raised from the unique index, not from a pre-check. */
export class EmailTakenError extends Error {
  readonly code = 'EMAIL_TAKEN';

  constructor() {
    super('An account with this email already exists.');
    this.name = 'EmailTakenError';
  }
}

export interface NewUser {
  /** Already normalized (trimmed, lowercase) by the caller. */
  email: string;
  passwordHash: string;
  /** UTC ISO 8601 text, supplied by the caller's clock. */
  createdAt: string;
}

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

function isEmailUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const code = (err as { code?: unknown }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('users.email');
}

/** Inserts a user. Throws EmailTakenError if the unique index on users.email rejects the row. */
export function insertUser(db: Db, user: NewUser): { id: number; email: string } {
  try {
    const result = db.run(
      'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
      [user.email, user.passwordHash, user.createdAt],
    );
    return { id: result.lastInsertRowid, email: user.email };
  } catch (err) {
    if (isEmailUniqueViolation(err)) {
      throw new EmailTakenError();
    }
    throw err;
  }
}

/** Finds a user by normalized email. Returns undefined when there is no account. */
export function findUserByEmail(db: Db, email: string): UserRecord | undefined {
  const row = db.get<UserRow>(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
    [email],
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}
