// The storage the trip service needs (F2.R1, F2.R5, F2.R9, F2.R11). The service takes this
// interface, so its tests use an in-memory fake. The real adapter, added in a later task, wraps the
// functions in db/repositories/trips.ts.

/** A trip as the service sees it. `owner_id` is kept so the shared ownership check can run (F1.R11). */
export interface StoredTrip {
  id: number;
  owner_id: number;
  name: string;
  /** UTC ISO 8601 text. */
  createdAt: string;
}

/** The fields the service passes to insert. The store assigns the ID. */
export interface NewStoredTrip {
  ownerId: number;
  /** Already trimmed and checked (1 to 100 characters). */
  name: string;
  /** UTC ISO 8601 text, from the injected clock. */
  createdAt: string;
}

export interface TripStore {
  /** Inserts a trip and returns its new ID. No uniqueness check on name (F2.R3). */
  insertTrip(trip: NewStoredTrip): number;
  /** Returns only the trips owned by `ownerId` (F2.R11). Order is not guaranteed; the service sorts. */
  listTripsByOwner(ownerId: number): StoredTrip[];
  /**
   * Returns the trip with this ID only if `ownerId` owns it (F1.R11, F2.R11). Returns undefined for
   * a missing trip and for another user's trip. The service checks ownership again as a second guard.
   */
  findTrip(id: number, ownerId: number): StoredTrip | undefined;
  /**
   * Deletes the trip with this ID, only when `ownerId` owns it. Returns true when a row was removed.
   * Child rows cascade (F2.R9).
   */
  deleteTrip(id: number, ownerId: number): boolean;
  /** Runs `work` in one database transaction and returns its result (F2.R9, project-rules.md). */
  transaction<T>(work: () => T): T;
}
