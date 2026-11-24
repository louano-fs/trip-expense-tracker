import type { Db } from '../open.ts';

export interface NewSession {
  /** SHA-256 hex of the session ID. The raw ID stays in the cookie and is never stored. */
  idHash: string;
  userId: number;
  /** UTC ISO 8601 text. */
  createdAt: string;
  /** UTC ISO 8601 text: createdAt plus 30 days, set by the caller. */
  expiresAt: string;
}

export interface SessionRecord {
  idHash: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
}

interface SessionRow {
  id_hash: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

export function insertSession(db: Db, session: NewSession): void {
  db.run(
    'INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [session.idHash, session.userId, session.createdAt, session.expiresAt],
  );
}

/** Finds a session by the hash of its ID. Expiry is checked by the caller, not here. */
export function findSessionByHash(db: Db, idHash: string): SessionRecord | undefined {
  const row = db.get<SessionRow>(
    'SELECT id_hash, user_id, created_at, expires_at FROM sessions WHERE id_hash = ?',
    [idHash],
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    idHash: row.id_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** Deletes one session record. Returns true when a row was removed. */
export function deleteSession(db: Db, idHash: string): boolean {
  const result = db.run('DELETE FROM sessions WHERE id_hash = ?', [idHash]);
  return result.changes > 0;
}
