// Client for the F2 trip endpoints. It uses the browser's fetch, like F1's
// client in ./client.ts, and throws the same ApiError for failures. The two
// outcomes the screens show differently are returned as values: a 404 for one
// trip ('not-found') and a 400 for the trip name (field and message).

import { ApiError } from './client';

export interface Trip {
  id: number;
  name: string;
  createdAt: string;
}

export type CreateTripResult =
  | { ok: true; trip: Trip }
  | { ok: false; field: 'name'; message: string };

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const TRIPS_PATH = '/api/trips';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Reads a JSON body. A body that is not JSON gives null instead of failing again.
// The body is never logged.
async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// Builds an ApiError from an error response. Trip errors carry no field here,
// because createTrip handles its own 400 before this is used.
async function toApiError(response: Response): Promise<ApiError> {
  const body = await readBody(response);
  const error = isRecord(body) ? body.error : undefined;
  const message = typeof error === 'string' && error.length > 0 ? error : GENERIC_MESSAGE;
  return new ApiError(response.status, message, null, null);
}

export async function listTrips(): Promise<Trip[]> {
  const response = await fetch(TRIPS_PATH, { credentials: 'same-origin' });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const body = (await response.json()) as { trips: Trip[] };
  return body.trips;
}

export async function createTrip(name: string): Promise<CreateTripResult> {
  const response = await fetch(TRIPS_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.status === 400) {
    const body = await readBody(response);
    const message = isRecord(body) ? body.message : undefined;
    if (isRecord(body) && body.field === 'name' && typeof message === 'string') {
      return { ok: false, field: 'name', message };
    }
    throw new ApiError(400, GENERIC_MESSAGE, null, null);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  const body = (await response.json()) as { trip: Trip };
  return { ok: true, trip: body.trip };
}

export async function getTrip(id: number): Promise<Trip | 'not-found'> {
  const response = await fetch(`${TRIPS_PATH}/${encodeURIComponent(String(id))}`, {
    credentials: 'same-origin',
  });
  if (response.status === 404) {
    return 'not-found';
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  const body = (await response.json()) as { trip: Trip };
  return body.trip;
}

export async function deleteTrip(id: number): Promise<'deleted' | 'not-found'> {
  const response = await fetch(`${TRIPS_PATH}/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (response.status === 404) {
    return 'not-found';
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return 'deleted';
}
