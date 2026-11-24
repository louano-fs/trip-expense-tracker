import type { Db } from '../open.ts';

export interface NewTrip {
  ownerId: number;
  /** Already trimmed and checked (1 to 100 characters) by the caller. */
  name: string;
  /** UTC ISO 8601 text, supplied by the caller's clock. */
  createdAt: string;
}

export interface TripRecord {
  id: number;
  name: string;
  createdAt: string;
}

interface TripRow {
  id: number;
  name: string;
  created_at: string;
}

/**
 * Inserts a trip and returns its new ID. There is no uniqueness check on name, so one owner can
 * have several trips with the same name (F2.R3, F2.AC4). That is checked by code review.
 */
export function insertTrip(db: Db, trip: NewTrip): number {
  const result = db.run('INSERT INTO trips (owner_id, name, created_at) VALUES (?, ?, ?)', [
    trip.ownerId,
    trip.name,
    trip.createdAt,
  ]);
  return result.lastInsertRowid;
}

/** Lists the owner's trips, newest first; trips created at the same instant are ordered by ID (F2.R5). */
export function listTripsByOwner(db: Db, ownerId: number): TripRecord[] {
  const rows = db.all<TripRow>(
    'SELECT id, name, created_at FROM trips WHERE owner_id = ? ORDER BY created_at DESC, id DESC',
    [ownerId],
  );
  return rows.map(mapTrip);
}

/**
 * Finds one trip only if it belongs to the owner (F1.R11, F2.R11). Returns undefined for a missing
 * trip and for another user's trip, so the two cannot be told apart.
 */
export function findTripForOwner(db: Db, id: number, ownerId: number): TripRecord | undefined {
  const row = db.get<TripRow>(
    'SELECT id, name, created_at FROM trips WHERE id = ? AND owner_id = ?',
    [id, ownerId],
  );
  if (row === undefined) {
    return undefined;
  }
  return mapTrip(row);
}

/**
 * Deletes one trip by ID, only when it belongs to the owner (F1.R11). Child rows (people, expenses,
 * payments) are removed by ON DELETE CASCADE on trips.id (F2.R9). The caller runs this in a
 * transaction. Returns true when a row was removed.
 */
export function deleteTripById(db: Db, id: number, ownerId: number): boolean {
  const result = db.run('DELETE FROM trips WHERE id = ? AND owner_id = ?', [id, ownerId]);
  return result.changes > 0;
}

function mapTrip(row: TripRow): TripRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}
