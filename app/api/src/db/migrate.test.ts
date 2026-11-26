import { describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations, MIGRATIONS_DIR, type Migration } from './migrate.ts';
import type { Db, RunResult, SqlValue } from './open.ts';

interface Call {
  method: 'exec' | 'run' | 'get' | 'all';
  sql: string;
  params: readonly SqlValue[];
}

/**
 * Fake Db. It records every statement and keeps migration records the way a transaction would:
 * records made inside a transaction are kept on COMMIT and dropped on ROLLBACK.
 */
class FakeDb implements Db {
  readonly calls: Call[] = [];
  readonly applied = new Set<string>();
  private pending = new Set<string>();

  constructor(private readonly failOnSql?: string) {}

  exec(sql: string): void {
    this.calls.push({ method: 'exec', sql, params: [] });
    this.maybeFail(sql);
    if (sql === 'COMMIT') {
      this.pending.forEach((id) => this.applied.add(id));
      this.pending.clear();
    }
    if (sql === 'ROLLBACK') {
      this.pending.clear();
    }
  }

  run(sql: string, params: readonly SqlValue[] = []): RunResult {
    this.calls.push({ method: 'run', sql, params });
    this.maybeFail(sql);
    if (sql.startsWith('INSERT INTO schema_migrations')) {
      this.pending.add(String(params[0]));
    }
    return { changes: 1, lastInsertRowid: 0 };
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    this.calls.push({ method: 'get', sql, params });
    return undefined;
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    this.calls.push({ method: 'all', sql, params });
    return [...this.applied].map((id) => ({ id })) as T[];
  }

  private maybeFail(sql: string): void {
    if (this.failOnSql !== undefined && sql.includes(this.failOnSql)) {
      throw new Error(`fake failure in ${this.failOnSql}`);
    }
  }
}

const fixedNow = () => new Date('2026-11-24T10:00:00.000Z');

const migrations: Migration[] = [
  { id: '001-first', sql: 'CREATE TABLE first_table (id INTEGER)' },
  { id: '002-second', sql: 'CREATE TABLE second_table (id INTEGER)' },
];

describe('F1.R7 migrations (data model support)', () => {
  it('F1.R7 applies each pending migration once, in order, each in its own transaction', () => {
    const db = new FakeDb();

    const ran = applyMigrations(db, migrations, fixedNow);

    expect(ran).toEqual(['001-first', '002-second']);
    const executed = db.calls.filter((c) => c.method === 'exec').map((c) => c.sql);
    expect(executed).toEqual([
      'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
      'BEGIN',
      'CREATE TABLE first_table (id INTEGER)',
      'COMMIT',
      'BEGIN',
      'CREATE TABLE second_table (id INTEGER)',
      'COMMIT',
    ]);
  });

  it('F1.R7 does not run a migration a second time once it is recorded', () => {
    const db = new FakeDb();

    applyMigrations(db, migrations, fixedNow);
    const secondRun = applyMigrations(db, migrations, fixedNow);

    expect(secondRun).toEqual([]);
    const migrationSql = db.calls
      .filter((c) => c.method === 'exec' && c.sql.startsWith('CREATE TABLE first_table'))
      .length;
    expect(migrationSql).toBe(1);
  });

  it('F1.R7 writes the version record with the UTC time as a parameter', () => {
    const db = new FakeDb();

    applyMigrations(db, [migrations[0]], fixedNow);

    const record = db.calls.find((c) => c.sql.startsWith('INSERT INTO schema_migrations'));
    expect(record?.params).toEqual(['001-first', '2026-11-24T10:00:00.000Z']);
  });

  it('F1.R7 a failing migration rolls back, is not recorded, stops the run, and throws', () => {
    const db = new FakeDb('second_table');

    expect(() => applyMigrations(db, migrations, fixedNow)).toThrow('fake failure in second_table');

    const executed = db.calls.filter((c) => c.method === 'exec').map((c) => c.sql);
    expect(executed).toContain('ROLLBACK');
    // Only the first migration committed; the failed one never reached COMMIT.
    expect(executed.filter((sql) => sql === 'COMMIT')).toHaveLength(1);
    expect(db.applied.has('002-second')).toBe(false);
    expect(db.applied.has('001-first')).toBe(true);
  });

  it('F1.R7 a failing migration rolls back without swallowing the original error when rollback also fails', () => {
    class RollbackFailsDb extends FakeDb {
      override exec(sql: string): void {
        if (sql === 'ROLLBACK') {
          throw new Error('rollback broke');
        }
        super.exec(sql);
      }
    }
    const db = new RollbackFailsDb('first_table');

    expect(() => applyMigrations(db, [migrations[0]], fixedNow)).toThrow(AggregateError);
  });

  it('F1.R2 001-auth creates a unique index on users.email', () => {
    const loaded = loadMigrations(MIGRATIONS_DIR);
    const auth = loaded.find((m) => m.id === '001-auth');

    expect(auth).toBeDefined();
    expect(auth?.sql).toContain('CREATE UNIQUE INDEX users_email_key ON users (email)');
  });

  it('F1.R7 001-auth stores sessions with expiry and cascades on user delete', () => {
    const auth = loadMigrations(MIGRATIONS_DIR).find((m) => m.id === '001-auth');

    expect(auth?.sql).toContain('expires_at TEXT NOT NULL');
    expect(auth?.sql).toContain('REFERENCES users (id) ON DELETE CASCADE');
  });

  it('F1.R7 loadMigrations returns the SQL files sorted by name', () => {
    const loaded = loadMigrations(MIGRATIONS_DIR);

    expect(loaded.map((m) => m.id)).toEqual(['001-auth', '002-trips']);
  });
});
