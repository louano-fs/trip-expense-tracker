import { describe, expect, it } from 'vitest';
import type { NewSession, SessionRecord } from '../../db/repositories/sessions.ts';
import { createSession, SESSION_LIFETIME_MS, type Clock, type SessionStore } from '../../auth/sessions.ts';
import type { RouteResponse } from './auth.ts';
import { tripListPlaceholderRoute, tripPlaceholderRoute } from './trips-placeholder.ts';

// Fixed clock: no test reads the real time (project rules).
const NOW = new Date('2026-11-24T10:00:00.000Z');
const clockAt = (date: Date): Clock => ({ now: () => date });
const clock = clockAt(NOW);
const random = (size: number): Uint8Array => new Uint8Array(size).fill(7);

interface FakeResponse extends RouteResponse {
  statusCode: number;
  body: unknown;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
    },
    json(body: unknown) {
      res.body = body;
    },
    setHeader() {},
    end() {},
  };
  return res;
}

function memorySessionStore(): SessionStore & { rows: Map<string, SessionRecord> } {
  const rows = new Map<string, SessionRecord>();
  return {
    rows,
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

function request(cookie?: string) {
  return { headers: { cookie } };
}

describe('GET /api/trips/:id (placeholder)', () => {
  it('F1.AC10 with no cookie returns 401 and no trip data', () => {
    const route = tripPlaceholderRoute({ sessions: memorySessionStore(), clock });
    const res = fakeResponse();

    route(request(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('reason');
    expect(JSON.stringify(res.body)).not.toContain('trip');
  });

  it('F1.AC10 with no session cookie but another cookie has no reason key', () => {
    const route = tripPlaceholderRoute({ sessions: memorySessionStore(), clock });
    const res = fakeResponse();

    route(request('theme=dark'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('reason');
  });

  it('F1.AC23 with an unknown session cookie returns 401 with reason expired and no trip data', () => {
    const route = tripPlaceholderRoute({ sessions: memorySessionStore(), clock });
    const res = fakeResponse();

    route(request('__Host-sid=not-a-real-session'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F1.AC23 with a session that has reached 30 days returns 401 with reason expired and no trip data', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const atExpiry = clockAt(new Date(NOW.getTime() + SESSION_LIFETIME_MS));
    const route = tripPlaceholderRoute({ sessions, clock: atExpiry });
    const res = fakeResponse();

    route(request(`__Host-sid=${token}`), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F1.AC10 with a live session returns 200 with trip null, since F1 has no trips yet', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const route = tripPlaceholderRoute({ sessions, clock });
    const res = fakeResponse();

    route(request(`__Host-sid=${token}`), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ trip: null });
  });
});

describe('GET /api/trips (list placeholder)', () => {
  it('F1.AC10 with no cookie returns 401 with no reason key and no trip data', () => {
    const route = tripListPlaceholderRoute({ sessions: memorySessionStore(), clock });
    const res = fakeResponse();

    route(request(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toHaveProperty('reason');
    expect(res.body).not.toHaveProperty('trips');
  });

  it('F1.AC23 with an unknown session cookie returns 401 with reason expired and no trip data', () => {
    const route = tripListPlaceholderRoute({ sessions: memorySessionStore(), clock });
    const res = fakeResponse();

    route(request('__Host-sid=not-a-real-session'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
    expect(res.body).not.toHaveProperty('trips');
  });

  it('F1.AC23 with a session that has reached 30 days returns 401 with reason expired and no trip data', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const atExpiry = clockAt(new Date(NOW.getTime() + SESSION_LIFETIME_MS));
    const route = tripListPlaceholderRoute({ sessions, clock: atExpiry });
    const res = fakeResponse();

    route(request(`__Host-sid=${token}`), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', reason: 'expired' });
  });

  it('F1.AC10 with a live session returns 200 with an empty trip list', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const route = tripListPlaceholderRoute({ sessions, clock });
    const res = fakeResponse();

    route(request(`__Host-sid=${token}`), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ trips: [] });
  });
});
