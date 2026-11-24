import { describe, expect, it } from 'vitest';
import {
  deleteTripById,
  findTripForOwner,
  insertTrip,
  listTripsByOwner,
} from './trips.ts';
import type { Db, RunResult, SqlValue } from '../open.ts';

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

  exec(sql: string): void {
    this.calls.push({ method: 'exec', sql, params: [] });
  }

  run(sql: string, params: readonly SqlValue[] = []): RunResult {
    this.calls.push({ method: 'run', sql, params });
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

const CREATED_AT = '2026-11-24T10:00:00.000Z';
const OWNER_ID = 3;
const OTHER_OWNER_ID = 4;
const TRIP_ID = 12;

describe('F2.R3 insertTrip repository', () => {
  it('F2.R3 insertTrip uses ? placeholders and passes owner, name and time as parameters', () => {
    const db = new FakeDb();

    insertTrip(db, { ownerId: OWNER_ID, name: 'Ski weekend', createdAt: CREATED_AT });

    expectParameterised(db.lastCall(), [OWNER_ID, 'Ski weekend', CREATED_AT]);
    expect(db.lastCall().sql).toContain('INSERT INTO trips');
  });

  it('F2.R3 insertTrip sends the same name again without a uniqueness check (F2.AC4 is checked in review)', () => {
    const db = new FakeDb();

    insertTrip(db, { ownerId: OWNER_ID, name: 'Ski weekend', createdAt: CREATED_AT });
    insertTrip(db, { ownerId: OWNER_ID, name: 'Ski weekend', createdAt: CREATED_AT });

    expect(db.calls).toHaveLength(2);
    expect(db.calls.every((call) => call.method === 'run')).toBe(true);
    expect(db.calls[1]?.params).toEqual([OWNER_ID, 'Ski weekend', CREATED_AT]);
  });

  it('F2.R3 insertTrip returns the new ID', () => {
    const db = new FakeDb();

    expect(insertTrip(db, { ownerId: OWNER_ID, name: 'Lisbon', createdAt: CREATED_AT })).toBe(7);
  });
});

describe('F2.AC7 listTripsByOwner repository', () => {
  it('F2.AC7 listTripsByOwner sends the owner as a parameter and filters on owner_id', () => {
    const db = new FakeDb();

    listTripsByOwner(db, OWNER_ID);

    expectParameterised(db.lastCall(), [OWNER_ID]);
    expect(db.lastCall().sql).toContain('WHERE owner_id = ?');
  });

  it('F2.AC7 listTripsByOwner orders by created_at DESC, then id DESC', () => {
    const db = new FakeDb();

    listTripsByOwner(db, OWNER_ID);

    expect(db.lastCall().sql).toContain('ORDER BY created_at DESC, id DESC');
  });

  it('F2.AC5 listTripsByOwner maps rows to id, name and createdAt only', () => {
    const db = new FakeDb();
    db.rows = [
      { id: 2, name: 'Lisbon', created_at: CREATED_AT, owner_id: OWNER_ID },
      { id: 1, name: 'Ski weekend', created_at: '2026-11-01T08:00:00.000Z' },
    ];

    const trips = listTripsByOwner(db, OWNER_ID);

    expect(trips).toEqual([
      { id: 2, name: 'Lisbon', createdAt: CREATED_AT },
      { id: 1, name: 'Ski weekend', createdAt: '2026-11-01T08:00:00.000Z' },
    ]);
  });

  it('F2.AC7 listTripsByOwner returns an empty list when the owner has no trips', () => {
    const db = new FakeDb();

    expect(listTripsByOwner(db, OTHER_OWNER_ID)).toEqual([]);
    expect(db.lastCall().params).toEqual([OTHER_OWNER_ID]);
  });
});

describe('F2.AC8 findTripForOwner repository', () => {
  it('F2.AC8 findTripForOwner sends both the trip ID and the owner as parameters', () => {
    const db = new FakeDb();

    findTripForOwner(db, TRIP_ID, OWNER_ID);

    expectParameterised(db.lastCall(), [TRIP_ID, OWNER_ID]);
    expect(db.lastCall().sql).toContain('WHERE id = ? AND owner_id = ?');
  });

  it('F2.AC8 findTripForOwner returns undefined when the row is missing or owned by someone else', () => {
    const db = new FakeDb();

    expect(findTripForOwner(db, TRIP_ID, OTHER_OWNER_ID)).toBeUndefined();
  });

  it('F2.AC8 findTripForOwner maps the row to id, name and createdAt only', () => {
    const db = new FakeDb();
    db.rows = [{ id: TRIP_ID, name: 'Lisbon', created_at: CREATED_AT, owner_id: OWNER_ID }];

    expect(findTripForOwner(db, TRIP_ID, OWNER_ID)).toEqual({
      id: TRIP_ID,
      name: 'Lisbon',
      createdAt: CREATED_AT,
    });
  });
});

describe('F2.R9 deleteTripById repository', () => {
  it('F2.R9 deleteTripById uses a ? placeholder and passes the trip ID as a parameter', () => {
    const db = new FakeDb();

    deleteTripById(db, TRIP_ID);

    expectParameterised(db.lastCall(), [TRIP_ID]);
    expect(db.lastCall().sql).toContain('DELETE FROM trips WHERE id = ?');
  });

  it('F2.R9 deleteTripById returns true when a row was removed', () => {
    const db = new FakeDb();
    db.runResult = { changes: 1, lastInsertRowid: 0 };

    expect(deleteTripById(db, TRIP_ID)).toBe(true);
  });

  it('F2.AC12 deleteTripById returns false when no row matched', () => {
    const db = new FakeDb();
    db.runResult = { changes: 0, lastInsertRowid: 0 };

    expect(deleteTripById(db, TRIP_ID)).toBe(false);
  });
});
