import type { Db } from '../open.ts';

export interface ThrottleState {
  /** Normalized email as typed. Kept whether or not an account exists (F1.R13). */
  email: string;
  consecutiveFailures: number;
  /** UTC ISO 8601 text, or null when no wait applies. */
  nextAllowedAt: string | null;
}

interface ThrottleRow {
  email: string;
  consecutive_failures: number;
  next_allowed_at: string | null;
}

export function getThrottle(db: Db, email: string): ThrottleState | undefined {
  const row = db.get<ThrottleRow>(
    'SELECT email, consecutive_failures, next_allowed_at FROM login_throttle WHERE email = ?',
    [email],
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    email: row.email,
    consecutiveFailures: row.consecutive_failures,
    nextAllowedAt: row.next_allowed_at,
  };
}

/** Inserts or replaces the throttle state for one email. */
export function saveThrottle(db: Db, state: ThrottleState): void {
  db.run(
    `INSERT INTO login_throttle (email, consecutive_failures, next_allowed_at)
     VALUES (?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET
       consecutive_failures = excluded.consecutive_failures,
       next_allowed_at = excluded.next_allowed_at`,
    [state.email, state.consecutiveFailures, state.nextAllowedAt],
  );
}

/** Removes the throttle state for one email (used after a successful login). */
export function clearThrottle(db: Db, email: string): void {
  db.run('DELETE FROM login_throttle WHERE email = ?', [email]);
}
