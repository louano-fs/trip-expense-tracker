// HTTP routes for trips (F2.R1, F2.R5, F2.R8, F2.R11, F2.R12). Handlers are plain functions over an
// injected service and session store. Each one runs the login gate first (F1.R10), before any trip data is read.
import { apiGuard } from '../../auth/guards.ts';
import type { Clock, SessionStore } from '../../auth/sessions.ts';
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  type CreateTripResult,
  type DeleteTripResult,
  type TripLookupResult,
} from '../../trips/service.ts';
import type { StoredTrip, TripStore } from '../../trips/store.ts';
import { tripView } from '../../trips/views.ts';
import { readSessionToken } from '../cookies.ts';
import type { RouteResponse } from './auth.ts';

/** The request fields the trip routes read. Express's Request satisfies this. */
export interface TripRequest {
  body: unknown;
  params: { id?: string | undefined };
  headers: { cookie?: string | undefined };
}

/** The trip rules the routes call, with the owner already known from the session. Wired in index.ts. */
export interface TripRouteService {
  createTrip(input: { ownerId: number; rawName: string }): CreateTripResult;
  listTrips(input: { ownerId: number }): StoredTrip[];
  getTrip(input: { ownerId: number; tripId: number }): TripLookupResult;
  deleteTrip(input: { ownerId: number; tripId: number }): DeleteTripResult;
}

export interface TripRouteDeps {
  sessions: SessionStore;
  clock: Clock;
  service: TripRouteService;
}

/** The body for a missing trip and for another user's trip. Both give the same body (F2.AC8, F2.AC12). */
const TRIP_NOT_FOUND_MESSAGE = 'Trip not found';

/** A refused request: the status and the body to send. The body never contains trip data. */
interface GateDenied {
  status: 401;
  body: { error: 'Unauthorized'; reason?: 'expired' };
}

/**
 * The login gate (F1.R10). Returns the logged-in user's ID, or the 401 to send.
 * The 401 has `reason: 'expired'` only when a session cookie was sent but no live session matched,
 * so the web app can show the expired notice (F1.R7, F1.AC23). With no cookie there is no reason key.
 */
function loginGate(
  req: TripRequest,
  deps: TripRouteDeps,
): { ok: true; userId: number } | { ok: false; denied: GateDenied } {
  const token = readSessionToken(req.headers.cookie);
  const guard = apiGuard({ token, sessions: deps.sessions, clock: deps.clock });
  if (guard.ok) {
    return { ok: true, userId: guard.user.id };
  }
  return {
    ok: false,
    denied: {
      status: guard.status,
      body: token === undefined ? { error: 'Unauthorized' } : { error: 'Unauthorized', reason: 'expired' },
    },
  };
}

function sendDenied(res: RouteResponse, denied: GateDenied): void {
  res.status(denied.status);
  res.json(denied.body);
}

function sendNotFound(res: RouteResponse): void {
  res.status(404);
  res.json({ error: TRIP_NOT_FOUND_MESSAGE });
}

/** Reads the trip name from a JSON body. A missing or non-text name is empty, so the rules give their own message. */
function readTripName(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const value: unknown = (body as Record<string, unknown>).name;
  return typeof value === 'string' ? value : '';
}

/**
 * Reads the trip ID from the path. Only a positive whole number is an ID; anything else cannot be a
 * trip, so the route answers not-found without a store read.
 */
function readTripId(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

/** GET /api/trips: 200 with the logged-in user's trips, newest first, and no paging (F2.R5, F2.R11). */
export function listTripsHandler(deps: TripRouteDeps): (req: TripRequest, res: RouteResponse) => void {
  return (req, res) => {
    const gate = loginGate(req, deps);
    if (!gate.ok) {
      sendDenied(res, gate.denied);
      return;
    }
    const trips = deps.service.listTrips({ ownerId: gate.userId });
    res.status(200);
    res.json({ trips: trips.map((trip) => tripView(trip)) });
  };
}

/** POST /api/trips: 201 with the new trip; 400 with the field and message for a bad name (F2.R1, F2.R2, F2.R3). */
export function createTripHandler(deps: TripRouteDeps): (req: TripRequest, res: RouteResponse) => void {
  return (req, res) => {
    const gate = loginGate(req, deps);
    if (!gate.ok) {
      sendDenied(res, gate.denied);
      return;
    }
    const result = deps.service.createTrip({ ownerId: gate.userId, rawName: readTripName(req.body) });
    if (!result.ok) {
      res.status(400);
      res.json({ field: result.field, message: result.message });
      return;
    }
    res.status(201);
    res.json({ trip: tripView(result.trip) });
  };
}

/** GET /api/trips/:id: 200 with the trip if the user owns it; 404 otherwise (F2.R11, F2.R12). */
export function getTripHandler(deps: TripRouteDeps): (req: TripRequest, res: RouteResponse) => void {
  return (req, res) => {
    const gate = loginGate(req, deps);
    if (!gate.ok) {
      sendDenied(res, gate.denied);
      return;
    }
    const tripId = readTripId(req.params.id);
    if (tripId === undefined) {
      sendNotFound(res);
      return;
    }
    const result = deps.service.getTrip({ ownerId: gate.userId, tripId });
    if (!result.ok) {
      sendNotFound(res);
      return;
    }
    res.status(200);
    res.json({ trip: tripView(result.trip) });
  };
}

/** DELETE /api/trips/:id: 204 when the user owns the trip and it is deleted with its contents; 404 otherwise (F2.R8, F2.R9, F2.R11, F2.R12). */
export function deleteTripHandler(deps: TripRouteDeps): (req: TripRequest, res: RouteResponse) => void {
  return (req, res) => {
    const gate = loginGate(req, deps);
    if (!gate.ok) {
      sendDenied(res, gate.denied);
      return;
    }
    const tripId = readTripId(req.params.id);
    if (tripId === undefined) {
      sendNotFound(res);
      return;
    }
    const result = deps.service.deleteTrip({ ownerId: gate.userId, tripId });
    if (!result.ok) {
      sendNotFound(res);
      return;
    }
    res.status(204);
    res.end();
  };
}

/**
 * Builds the trip service the routes call, over a trip store and the injected clock.
 * index.ts uses this with the real store; tests use it with an in-memory store.
 */
export function tripRouteService(deps: { store: TripStore; clock: Clock }): TripRouteService {
  const lookup = { store: deps.store };
  return {
    createTrip: (input) => createTrip(input, { store: deps.store, clock: deps.clock }),
    listTrips: (input) => listTrips(input, lookup),
    getTrip: (input) => getTrip(input, lookup),
    deleteTrip: (input) => deleteTrip(input, lookup),
  };
}
