import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './open.ts';

export interface Migration {
  /** Name without the `.sql` extension, for example `001-auth`. Stored in schema_migrations. */
  id: string;
  sql: string;
}

/** Folder holding the numbered migration files. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/** Reads `*.sql` files from a folder, sorted by file name so they run in order. */
export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      id: file.slice(0, -'.sql'.length),
      sql: readFileSync(join(dir, file), 'utf8'),
    }));
}

/**
 * Applies every migration not yet recorded, in the order given. Each migration runs in one
 * transaction together with its schema_migrations record. A failure rolls back and is rethrown.
 * Returns the ids applied by this call.
 */
export function applyMigrations(db: Db, migrations: readonly Migration[], now: () => Date): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    db.all<{ id: string }>('SELECT id FROM schema_migrations').map((row) => row.id),
  );

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    applyOne(db, migration, now());
    ran.push(migration.id);
  }
  return ran;
}

function applyOne(db: Db, migration: Migration, appliedAt: Date): void {
  db.exec('BEGIN');
  try {
    db.exec(migration.sql);
    db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
      migration.id,
      appliedAt.toISOString(),
    ]);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackErr) {
      throw new AggregateError(
        [err, rollbackErr],
        `Migration ${migration.id} failed, and the rollback failed too`,
      );
    }
    throw err;
  }
}
