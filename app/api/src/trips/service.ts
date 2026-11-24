// Trip rules: create, list, get and delete (F2.R1, F2.R3, F2.R4, F2.R5, F2.R9, F2.R11, F2.R12).
// Plain functions that take a store and a clock, so tests need no database.

import { ownsTrip } from '../auth/guards.ts';
import type { Clock } from '../auth/sessions.ts';
import { validateTripName } from './validation.ts';
import type { StoredTrip, TripStore } from './store.ts';

export type CreateTripResult =
  | { ok: true; trip: StoredTrip }
  | { ok: false; field: 'name'; message: string };

export type TripLookupResult =
  | { ok: true; trip: StoredTrip }
  | { ok: false; reason: 'not-found' };

export type DeleteTripResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' };

export interface TripDeps {
  store: TripStore;
}

export interface CreateTripDeps extends TripDeps {
  clock: Clock;
}

/**
 * Creates a trip owned by `ownerId` (F2.R1, F2.R2, F2.R3). The name is trimmed and checked first.
 * The created time is the clock's UTC instant. The result carries the trip, so the caller can send
 * the user to the trip page by its ID (F2.R4).
 */
export function createTrip(
  input: { ownerId: number; rawName: string },
  deps: CreateTripDeps,
): CreateTripResult {
  const checked = validateTripName(input.rawName);
  if (!checked.ok) {
    return checked;
  }
  const createdAt = deps.clock.now().toISOString();
  const id = deps.store.insertTrip({
    ownerId: input.ownerId,
    name: checked.name,
    createdAt,
  });
  return {
    ok: true,
    trip: { id, owner_id: input.ownerId, name: checked.name, createdAt },
  };
}

/**
 * Lists the owner's trips, newest first; ties by ID so the order is stable (F2.R5).
 * The store returns only the owner's trips (F2.R11); the owner check here is a second guard.
 */
export function listTrips(input: { ownerId: number }, deps: TripDeps): StoredTrip[] {
  const owned = deps.store
    .listTripsByOwner(input.ownerId)
    .filter((trip) => trip.owner_id === input.ownerId);
  return sortTripsNewestFirst(owned);
}

/** Pure sort: createdAt descending, then id descending. Returns a new array. */
export function sortTripsNewestFirst(trips: readonly StoredTrip[]): StoredTrip[] {
  return [...trips].sort((a, b) => {
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    return b.id - a.id;
  });
}

/** Returns one trip if the user owns it. A missing or another user's trip is 'not-found' (F2.R11, F2.R12). */
export function getTrip(
  input: { ownerId: number; tripId: number },
  deps: TripDeps,
): TripLookupResult {
  const trip = deps.store.findTrip(input.tripId);
  if (trip === undefined || ownsTrip(trip, input.ownerId) === 'not-found') {
    return { ok: false, reason: 'not-found' };
  }
  return { ok: true, trip };
}

/**
 * Deletes a trip the user owns, with everything in it (F2.R9, F2.R11, F2.R12). The reload, the
 * ownership check and the delete run in one store transaction, so nothing changes between them.
 */
export function deleteTrip(
  input: { ownerId: number; tripId: number },
  deps: TripDeps,
): DeleteTripResult {
  return deps.store.transaction<DeleteTripResult>(() => {
    const trip = deps.store.findTrip(input.tripId);
    if (ownsTrip(trip, input.ownerId) === 'not-found') {
      return { ok: false, reason: 'not-found' };
    }
    deps.store.deleteTrip(input.tripId);
    return { ok: true };
  });
}
