import { describe, expect, it, vi } from 'vitest';
import type { NewSession, SessionRecord } from '../../db/repositories/sessions.ts';
import { createSession, SESSION_LIFETIME_MS, type Clock, type SessionStore } from '../../auth/sessions.ts';
import type { StoredTrip, TripStore } from '../../trips/store.ts';
import type { RouteResponse } from './auth.ts';
import {
  createTripHandler,
  deleteTripHandler,
  getTripHandler,
  listTripsHandler,
  tripRouteService,
  type TripRequest,
  type TripRouteDeps,
  type TripRouteService,
} from './trips.ts';

// Fixed clock: no test reads the real time (project rules).
const NOW = new Date('2026-11-24T10:00:00.000Z');
const clockAt = (date: Date): Clock => ({ now: () => date });
const clock = clockAt(NOW);
const random = (size: number): Uint8Array => new Uint8Array(size).fill(7);

const OWNER = 1;
const OTHER_USER = 2;

interface FakeResponse extends RouteResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code: number) {
      res.statusCode = code;
    },
    json(body: unknown) {
      res.body = body;
    },
    setHeader() {},
    end() {
      res.ended = true;
    },
  };
  return res;
}

function memorySessionStore(): SessionStore {
  const rows = new Map<string, SessionRecord>();
  return {
    insert(session: NewSession) {
      rows.set(session.idHash, { ...session });
    },
    findByHash(idHash) {
      return rows.get(idHash);
    },
    delete(idHash) {
      return rows.delete(idHash);
    },
  };
}

/** A fake trip store in memory. Counts transactions so a test can see one was used (F2.R9). */
interface MemoryTripStore extends TripStore {
  trips: Map<number, StoredTrip>;
  transactionCount: number;
}

function memoryTripStore(): MemoryTripStore {
  const trips = new Map<number, StoredTrip>();
  let nextId = 1;
  const store: MemoryTripStore = {
    trips,
    transactionCount: 0,
    insertTrip(trip) {
      const id = nextId;
      nextId += 1;
      trips.set(id, { id, owner_id: trip.ownerId, name: trip.name, createdAt: trip.createdAt });
      return id;
    },
    listTripsByOwner(ownerId) {
      return [...trips.values()].filter((trip) => trip.owner_id === ownerId);
    },
    findTrip(id, ownerId) {
      const trip = trips.get(id);
      return trip !== undefined && trip.owner_id === ownerId ? trip : undefined;
    },
    deleteTrip(id, ownerId) {
      const trip = trips.get(id);
      if (trip === undefined || trip.owner_id !== ownerId) return false;
      return trips.delete(id);
    },
    transaction<T>(work: () => T): T {
      store.transactionCount += 1;
      return work();
    },
  };
  return store;
}

/** The real trip rules over the in-memory store, so ownership is checked as in the app. */
function realService(store: TripStore): TripRouteService {
  return tripRouteService({ store, clock });
}

/** A service fake whose methods are spies, for tests that check what the handler sends. */
function fakeService(): TripRouteService {
  return {
    createTrip: vi.fn(() => ({ ok: false as const, field: 'name' as const, message: 'Enter a trip name.' })),
    listTrips: vi.fn(() => []),
    getTrip: vi.fn(() => ({ ok: false as const, reason: 'not-found' as const })),
    deleteTrip: vi.fn(() => ({ ok: false as const, reason: 'not-found' as const })),
  };
}

/** Starts a live session for a user and returns the Cookie header value. */
function cookieFor(sessions: SessionStore, userId: number): string {
  const token = createSession({ userId, store: sessions, clock, random });
  return `__Host-sid=${token}`;
}

function request(options: { cookie?: string; body?: unknown; id?: string } = {}): TripRequest {
  return {
    headers: { cookie: options.cookie },
    body: options.body,
    params: { id: options.id },
  };
}

function depsFor(overrides: Partial<TripRouteDeps> & { store?: MemoryTripStore } = {}): TripRouteDeps & {
  store: MemoryTripStore;
  sessions: SessionStore;
} {
  const store = overrides.store ?? memoryTripStore();
  const sessions = memorySessionStore();
  return {
    sessions,
    clock,
    service: realService(store),
    store,
    ...overrides,
  };
}

const UNKNOWN_ID = '999';

describe('GET /api/trips (list)', () => {
  it('F2.AC9 with no cookie returns 401 with no trip data and does not read trips', () => {
    const service = fakeService();
    const res = fakeResponse();

    listTripsHandler({ sessions: memorySessionStore(), clock, service })(request(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('trips');
    expect(service.listTrips).not.toHaveBeenCalled();
  });

  it('F1.AC23 with an unknown session cookie returns 401 with reason expired and no trip data', () => {
    const res = fakeResponse();

    listTripsHandler(depsFor())(request({ cookie: '__Host-sid=not-a-real-session' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
    expect(res.body).not.toHaveProperty('trips');
  });

  it('F1.AC23 with a session that has reached 30 days returns 401 with reason expired and no trip data', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    listTripsHandler({ ...deps, clock: clockAt(new Date(NOW.getTime() + SESSION_LIFETIME_MS)) })(
      request({ cookie }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F2.AC7 with a live session returns 200 with only the logged-in user\'s trips', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    deps.service.createTrip({ ownerId: OTHER_USER, rawName: 'Other trip' });
    const res = fakeResponse();

    listTripsHandler(deps)(request({ cookie }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      trips: [{ id: 1, name: 'Lisbon', createdAt: NOW.toISOString() }],
    });
  });

  it('F2.AC13 list response contains no owner_id', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const res = fakeResponse();

    listTripsHandler(deps)(request({ cookie }), res);

    expect(JSON.stringify(res.body)).not.toContain('owner_id');
  });
});

describe('POST /api/trips (create)', () => {
  it('F2.AC9 with no cookie returns 401 with no trip data and creates nothing', () => {
    const deps = depsFor();
    const res = fakeResponse();

    createTripHandler(deps)(request({ body: { name: 'Lisbon' } }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(deps.store.trips.size).toBe(0);
  });

  it('F2.AC1 with a valid name returns 201 with the trip in the body and saves it for the owner', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: 'Lisbon' } }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      trip: { id: 1, name: 'Lisbon', createdAt: NOW.toISOString() },
    });
    expect(deps.store.trips.get(1)?.owner_id).toBe(OWNER);
  });

  it('F2.AC2 trims the name before saving it', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: '  Lisbon  ' } }), res);

    expect(res.statusCode).toBe(201);
    expect(deps.store.trips.get(1)?.name).toBe('Lisbon');
  });

  it('F2.AC2 a name of only spaces returns 400 with the field name and message and creates no trip', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: '   ' } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ field: 'name', message: 'Enter a trip name.' });
    expect(deps.store.trips.size).toBe(0);
  });

  it('F2.AC2 a missing or non-text name is treated as empty and returns 400 with no trip created', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: 42 } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ field: 'name', message: 'Enter a trip name.' });
    expect(deps.store.trips.size).toBe(0);
  });

  it('F2.AC3 a name of 101 characters returns 400 with the field name and message and creates no trip', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: 'a'.repeat(101) } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      field: 'name',
      message: 'Trip name must be 100 characters or fewer.',
    });
    expect(deps.store.trips.size).toBe(0);
  });

  it('F2.AC3 a name of exactly 100 characters returns 201', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: 'a'.repeat(100) } }), res);

    expect(res.statusCode).toBe(201);
  });

  it('F2.AC13 create response contains no owner_id', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    createTripHandler(deps)(request({ cookie, body: { name: 'Lisbon' } }), res);

    expect(JSON.stringify(res.body)).not.toContain('owner_id');
  });

  it('F2.AC1 passes the trimmed name and the logged-in user to the service', () => {
    const service = fakeService();
    const sessions = memorySessionStore();
    const cookie = cookieFor(sessions, OWNER);
    const res = fakeResponse();

    createTripHandler({ sessions, clock, service })(request({ cookie, body: { name: 'Lisbon' } }), res);

    expect(service.createTrip).toHaveBeenCalledWith({ ownerId: OWNER, rawName: 'Lisbon' });
  });
});

describe('GET /api/trips/:id (get)', () => {
  it('F2.AC9 with no cookie returns 401 with no trip data and does not read the trip', () => {
    const service = fakeService();
    const res = fakeResponse();

    getTripHandler({ sessions: memorySessionStore(), clock, service })(request({ id: '1' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(service.getTrip).not.toHaveBeenCalled();
  });

  it('F1.AC10 with no cookie returns 401 and no trip data', () => {
    const res = fakeResponse();

    getTripHandler(depsFor())(request({ id: '1' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('reason');
    expect(JSON.stringify(res.body)).not.toContain('trip');
  });

  it('F1.AC10 with no session cookie but another cookie has no reason key', () => {
    const res = fakeResponse();

    getTripHandler(depsFor())(request({ cookie: 'theme=dark', id: '1' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('reason');
  });

  it('F1.AC23 with an unknown session cookie returns 401 with reason expired and no trip data', () => {
    const res = fakeResponse();

    getTripHandler(depsFor())(request({ cookie: '__Host-sid=not-a-real-session', id: '1' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F1.AC23 with a session that has reached 30 days returns 401 with reason expired and no trip data', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    getTripHandler({ ...deps, clock: clockAt(new Date(NOW.getTime() + SESSION_LIFETIME_MS)) })(
      request({ cookie, id: '1' }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F2.R11 returns 200 with the trip for its owner', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const res = fakeResponse();

    getTripHandler(deps)(request({ cookie, id: '1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ trip: { id: 1, name: 'Lisbon', createdAt: NOW.toISOString() } });
  });

  it('F2.AC8 another user\'s trip returns 404 with the same body as an unknown ID', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OTHER_USER, rawName: 'Private' });
    const cookie = cookieFor(deps.sessions, OWNER);
    const otherUsersTrip = fakeResponse();
    const unknown = fakeResponse();

    getTripHandler(deps)(request({ cookie, id: '1' }), otherUsersTrip);
    getTripHandler(deps)(request({ cookie, id: UNKNOWN_ID }), unknown);

    expect(otherUsersTrip.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(otherUsersTrip.body).toEqual(unknown.body);
    expect(JSON.stringify(otherUsersTrip.body)).not.toContain('Private');
  });

  it('F2.AC8 another user\'s trip is unchanged after a GET from another user', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OTHER_USER, rawName: 'Private' });
    const cookie = cookieFor(deps.sessions, OWNER);

    getTripHandler(deps)(request({ cookie, id: '1' }), fakeResponse());

    expect(deps.store.trips.get(1)?.name).toBe('Private');
  });

  it('F2.AC12 an unknown ID returns 404 with the not-found body', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    getTripHandler(deps)(request({ cookie, id: UNKNOWN_ID }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Trip not found' });
  });

  it('F2.AC12 an ID that is not a positive whole number returns 404 without reading the store', () => {
    const service = fakeService();
    const sessions = memorySessionStore();
    const cookie = cookieFor(sessions, OWNER);
    const res = fakeResponse();

    getTripHandler({ sessions, clock, service })(request({ cookie, id: 'abc' }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Trip not found' });
    expect(service.getTrip).not.toHaveBeenCalled();
  });

  it('F2.AC13 get response contains no owner_id', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const res = fakeResponse();

    getTripHandler(deps)(request({ cookie, id: '1' }), res);

    expect(JSON.stringify(res.body)).not.toContain('owner_id');
  });
});

describe('DELETE /api/trips/:id (delete)', () => {
  it('F2.AC9 with no cookie returns 401 with no trip data and deletes nothing', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const res = fakeResponse();

    deleteTripHandler(deps)(request({ id: '1' }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(deps.store.trips.has(1)).toBe(true);
  });

  it('F2.R9 the owner\'s delete returns 204 with no body and removes the trip in one transaction', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    deleteTripHandler(deps)(request({ cookie, id: '1' }), res);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(res.ended).toBe(true);
    expect(deps.store.trips.has(1)).toBe(false);
    expect(deps.store.transactionCount).toBe(1);
  });

  it('F2.AC8 another user\'s trip returns 404 with the same body as an unknown ID and is unchanged', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OTHER_USER, rawName: 'Private' });
    const cookie = cookieFor(deps.sessions, OWNER);
    const otherUsersTrip = fakeResponse();
    const unknown = fakeResponse();

    deleteTripHandler(deps)(request({ cookie, id: '1' }), otherUsersTrip);
    deleteTripHandler(deps)(request({ cookie, id: UNKNOWN_ID }), unknown);

    expect(otherUsersTrip.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(otherUsersTrip.body).toEqual(unknown.body);
    expect(deps.store.trips.get(1)?.name).toBe('Private');
  });

  it('F2.AC12 an unknown ID returns 404 with the not-found body', () => {
    const deps = depsFor();
    const cookie = cookieFor(deps.sessions, OWNER);
    const res = fakeResponse();

    deleteTripHandler(deps)(request({ cookie, id: UNKNOWN_ID }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Trip not found' });
  });

  it('F2.AC12 a second delete of the same trip returns 404', () => {
    const deps = depsFor();
    deps.service.createTrip({ ownerId: OWNER, rawName: 'Lisbon' });
    const cookie = cookieFor(deps.sessions, OWNER);

    deleteTripHandler(deps)(request({ cookie, id: '1' }), fakeResponse());
    const again = fakeResponse();
    deleteTripHandler(deps)(request({ cookie, id: '1' }), again);

    expect(again.statusCode).toBe(404);
    expect(again.body).toEqual({ error: 'Trip not found' });
  });
});
