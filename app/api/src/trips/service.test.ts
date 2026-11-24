import { describe, expect, it } from 'vitest';
import type { Clock } from '../auth/sessions.ts';
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  sortTripsNewestFirst,
} from './service.ts';
import type { NewStoredTrip, StoredTrip, TripStore } from './store.ts';

// Fake store: in memory, IDs 1, 2, 3 ... in insert order. It records each transaction and whether
// each delete ran inside one, so tests can check the transaction rule (F2.AC11).
class FakeTripStore implements TripStore {
  rows: StoredTrip[] = [];
  transactionCalls = 0;
  private inTransaction = false;
  deleteCalls: { id: number; inTransaction: boolean }[] = [];
  private nextId = 1;

  insertTrip(trip: NewStoredTrip): number {
    const id = this.nextId;
    this.nextId += 1;
    this.rows.push({ id, owner_id: trip.ownerId, name: trip.name, createdAt: trip.createdAt });
    return id;
  }

  listTripsByOwner(ownerId: number): StoredTrip[] {
    return this.rows.filter((row) => row.owner_id === ownerId).map((row) => ({ ...row }));
  }

  findTrip(id: number): StoredTrip | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row === undefined ? undefined : { ...row };
  }

  deleteTrip(id: number): boolean {
    this.deleteCalls.push({ id, inTransaction: this.inTransaction });
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== id);
    return this.rows.length < before;
  }

  transaction<T>(work: () => T): T {
    this.transactionCalls += 1;
    this.inTransaction = true;
    try {
      return work();
    } finally {
      this.inTransaction = false;
    }
  }
}

function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

const USER_A = 1;
const USER_B = 2;
const T_NOON = '2026-11-24T12:00:00.000Z';

describe('F2.AC1 creating a trip', () => {
  it('F2.AC1 saves the trip with the owner, the trimmed name and the UTC created time', () => {
    const store = new FakeTripStore();
    const result = createTrip(
      { ownerId: USER_A, rawName: '  Lisbon  ' },
      { store, clock: fixedClock('2026-11-24T10:00:00.000Z') },
    );

    expect(store.rows).toEqual([
      { id: 1, owner_id: USER_A, name: 'Lisbon', createdAt: '2026-11-24T10:00:00.000Z' },
    ]);
    expect(result).toEqual({
      ok: true,
      trip: { id: 1, owner_id: USER_A, name: 'Lisbon', createdAt: '2026-11-24T10:00:00.000Z' },
    });
  });

  it('F2.AC1 the result points at the saved trip by its ID', () => {
    const store = new FakeTripStore();
    const result = createTrip(
      { ownerId: USER_A, rawName: 'Lisbon' },
      { store, clock: fixedClock(T_NOON) },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(store.findTrip(result.trip.id)?.name).toBe('Lisbon');
    }
  });

  it('F2.AC1 returns a field error and saves nothing for a blank name', () => {
    const store = new FakeTripStore();
    const result = createTrip({ ownerId: USER_A, rawName: '   ' }, { store, clock: fixedClock(T_NOON) });
    expect(result).toEqual({ ok: false, field: 'name', message: 'Enter a trip name.' });
    expect(store.rows).toEqual([]);
  });
});

describe('F2.AC4 duplicate trip names', () => {
  it('F2.AC4 accepts a second "Ski weekend" for the same owner', () => {
    const store = new FakeTripStore();
    const clock = fixedClock(T_NOON);
    createTrip({ ownerId: USER_A, rawName: 'Ski weekend' }, { store, clock });
    const second = createTrip({ ownerId: USER_A, rawName: 'Ski weekend' }, { store, clock });

    expect(second.ok).toBe(true);
    expect(store.rows.map((row) => row.name)).toEqual(['Ski weekend', 'Ski weekend']);
    expect(store.rows.map((row) => row.id)).toEqual([1, 2]);
  });
});

describe('F2.AC5 trips list order', () => {
  it('F2.AC5 returns three trips at different times newest first', () => {
    const store = new FakeTripStore();
    store.insertTrip({ ownerId: USER_A, name: 'Oldest', createdAt: '2026-01-01T09:00:00.000Z' });
    store.insertTrip({ ownerId: USER_A, name: 'Newest', createdAt: '2026-03-01T09:00:00.000Z' });
    store.insertTrip({ ownerId: USER_A, name: 'Middle', createdAt: '2026-02-01T09:00:00.000Z' });

    const names = listTrips({ ownerId: USER_A }, { store }).map((trip) => trip.name);
    expect(names).toEqual(['Newest', 'Middle', 'Oldest']);
  });

  it('F2.AC5 orders trips created at the same instant by ID, highest first', () => {
    const trips: StoredTrip[] = [
      { id: 1, owner_id: USER_A, name: 'first', createdAt: T_NOON },
      { id: 3, owner_id: USER_A, name: 'third', createdAt: T_NOON },
      { id: 2, owner_id: USER_A, name: 'second', createdAt: T_NOON },
    ];
    expect(sortTripsNewestFirst(trips).map((trip) => trip.id)).toEqual([3, 2, 1]);
  });

  it('F2.AC5 does not change the array it sorts', () => {
    const trips: StoredTrip[] = [
      { id: 1, owner_id: USER_A, name: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, owner_id: USER_A, name: 'b', createdAt: '2026-02-01T00:00:00.000Z' },
    ];
    sortTripsNewestFirst(trips);
    expect(trips.map((trip) => trip.id)).toEqual([1, 2]);
  });
});

describe('F2.AC7 trips are private to their owner', () => {
  it('F2.AC7 listing as user B returns only B\'s trips', () => {
    const store = new FakeTripStore();
    const clock = fixedClock(T_NOON);
    createTrip({ ownerId: USER_A, rawName: 'A trip' }, { store, clock });
    createTrip({ ownerId: USER_B, rawName: 'B trip one' }, { store, clock });
    createTrip({ ownerId: USER_B, rawName: 'B trip two' }, { store, clock });

    const listed = listTrips({ ownerId: USER_B }, { store });
    expect(listed.map((trip) => trip.name).sort()).toEqual(['B trip one', 'B trip two']);
    expect(listed.every((trip) => trip.owner_id === USER_B)).toBe(true);
  });
});

describe('F2.AC8 another user cannot read or delete a trip', () => {
  function storeWithATrip(): FakeTripStore {
    const store = new FakeTripStore();
    store.insertTrip({ ownerId: USER_A, name: 'A secret', createdAt: T_NOON });
    return store;
  }

  it("F2.AC8 getting A's trip as B returns not-found and leaves the store unchanged", () => {
    const store = storeWithATrip();
    const before = JSON.stringify(store.rows);

    const result = getTrip({ ownerId: USER_B, tripId: 1 }, { store });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(JSON.stringify(store.rows)).toBe(before);
  });

  it("F2.AC8 deleting A's trip as B returns not-found and leaves the store unchanged", () => {
    const store = storeWithATrip();
    const before = JSON.stringify(store.rows);

    const result = deleteTrip({ ownerId: USER_B, tripId: 1 }, { store });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(JSON.stringify(store.rows)).toBe(before);
    expect(store.deleteCalls).toEqual([]);
  });

  it("F2.AC8 the owner still gets A's trip", () => {
    const store = storeWithATrip();
    const result = getTrip({ ownerId: USER_A, tripId: 1 }, { store });
    expect(result.ok).toBe(true);
  });
});

describe('F2.AC11 deleting a trip runs in one transaction', () => {
  it('F2.AC11 calls the store transaction once and runs the delete inside it', () => {
    const store = new FakeTripStore();
    store.insertTrip({ ownerId: USER_A, name: 'Lisbon', createdAt: T_NOON });

    const result = deleteTrip({ ownerId: USER_A, tripId: 1 }, { store });

    expect(result).toEqual({ ok: true });
    expect(store.transactionCalls).toBe(1);
    expect(store.deleteCalls).toEqual([{ id: 1, inTransaction: true }]);
    expect(store.rows).toEqual([]);
  });
});

describe('F2.AC12 missing or deleted trips are not found', () => {
  it('F2.AC12 an unknown trip ID returns not-found for get and delete', () => {
    const store = new FakeTripStore();
    expect(getTrip({ ownerId: USER_A, tripId: 99 }, { store })).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(deleteTrip({ ownerId: USER_A, tripId: 99 }, { store })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('F2.AC12 a deleted trip returns not-found on the second delete', () => {
    const store = new FakeTripStore();
    store.insertTrip({ ownerId: USER_A, name: 'Lisbon', createdAt: T_NOON });

    expect(deleteTrip({ ownerId: USER_A, tripId: 1 }, { store })).toEqual({ ok: true });
    expect(deleteTrip({ ownerId: USER_A, tripId: 1 }, { store })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});
