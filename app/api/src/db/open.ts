import { createRequire } from 'node:module';

/** Values that can be bound as SQL parameters. Money is never stored as a float; times are ISO text. */
export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * The database surface used by repositories and migrations. Callers pass values only through
 * `params` with `?` placeholders in the SQL. `exec` is only for migration files and fixed statements.
 */
export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): RunResult;
  get<T>(sql: string, params?: readonly SqlValue[]): T | undefined;
  all<T>(sql: string, params?: readonly SqlValue[]): T[];
}

export interface Database extends Db {
  close(): void;
}

interface RawStatement {
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}

interface RawDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): RawStatement;
  close(): unknown;
}

type RawDatabaseConstructor = new (filename: string) => RawDatabase;

/**
 * Opens the SQLite file with foreign keys on (so ON DELETE CASCADE works) and WAL journaling.
 * The driver is loaded here, not at import time, so unit tests never load the native module.
 * `better-sqlite3` has no bundled types and `@types/better-sqlite3` is not installed, so the
 * constructor is typed locally below.
 */
export function openDatabase(filename: string): Database {
  const nodeRequire = createRequire(import.meta.url);
  // require() returns `any`; the cast gives it the local constructor type defined above.
  const BetterSqlite3 = nodeRequire('better-sqlite3') as RawDatabaseConstructor;
  const raw = new BetterSqlite3(filename);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA journal_mode = WAL');

  return {
    exec(sql: string): void {
      raw.exec(sql);
    },
    run(sql: string, params: readonly SqlValue[] = []): RunResult {
      const result = raw.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
    },
    get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
      return raw.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
      return raw.prepare(sql).all(...params) as T[];
    },
    close(): void {
      raw.close();
    },
  };
}
