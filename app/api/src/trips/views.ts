// Response shapes for trips (F2.R5, F2.AC13). Only the fields the API sends; never owner_id.

import type { StoredTrip } from './store.ts';

/** The trip as sent to the browser: `{ id, name, createdAt }` and nothing else (F2.AC13). */
export interface TripView {
  id: number;
  name: string;
  createdAt: string;
}

export function tripView(trip: StoredTrip): TripView {
  return { id: trip.id, name: trip.name, createdAt: trip.createdAt };
}
