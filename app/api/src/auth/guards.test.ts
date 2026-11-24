import { describe, expect, it } from 'vitest';
import type { NewSession, SessionRecord } from '../db/repositories/sessions.ts';
import { apiGuard, ownsTrip, pageGuard } from './guards.ts';
import {
  SESSION_LIFETIME_MS,
  createSession,
  type Clock,
  type RandomSource,
  type SessionStore,
} from './sessions.ts';

// In-memory session store keyed by id hash, so no database is needed.
function memoryStore() {
  const rows = new Map<string, SessionRecord>();
  const store: SessionStore = {
    insert(session: NewSession) {
      rows.set(session.idHash, { ...session });
    },
    findByHash(idHash: string) {
      return rows.get(idHash);
    },
    delete(idHash: string) {
      return rows.delete(idHash);
    },
  };
  return { store, rows };
}

// Fake clock whose time the test sets directly.
function fakeClock(start: string) {
  let current = Date.parse(start);
  const clock: Clock = { now: () => new Date(current) };
  return {
    clock,
    setTime(iso: string) {
      current = Date.parse(iso);
    },
  };
}

// Fake random source returning a fixed byte pattern, so the token is known.
function fakeRandom(fill: number): RandomSource {
  return (size: number) => new Uint8Array(size).fill(fill);
}

const START = '2026-11-01T10:00:00.000Z';

function setup() {
  const memory = memoryStore();
  const time = fakeClock(START);
  const token = createSession({
    userId: 1,
    store: memory.store,
    clock: time.clock,
    random: fakeRandom(7),
  });
  return { store: memory.store, time, token };
}

describe('F1.AC9 page guard redirects logged-out visitors to Log in', () => {
  it('F1.AC9 with no session cookie redirects to /login with no notice', () => {
    const { store, time } = setup();
    const result = pageGuard({ token: undefined, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ redirect: '/login', notice: undefined });
    expect('redirect' in result && result.notice).toBeUndefined();
  });

  it('F1.AC9 with an empty cookie value redirects to /login with no notice', () => {
    const { store, time } = setup();
    const result = pageGuard({ token: '', sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ redirect: '/login', notice: undefined });
  });

  it('F1.AC9 with an expired session redirects to /login with the expired notice', () => {
    const { store, time, token } = setup();
    time.setTime(new Date(Date.parse(START) + SESSION_LIFETIME_MS).toISOString());
    const result = pageGuard({ token, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ redirect: '/login', notice: 'expired' });
  });

  it('F1.AC9 with a live session lets the page render', () => {
    const { store, time, token } = setup();
    const result = pageGuard({ token, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ ok: true });
  });
});

describe('F1.AC10 API guard returns 401 with no data for logged-out requests', () => {
  it('F1.AC10 with no session cookie returns 401 and no user data', () => {
    const { store, time } = setup();
    const result = apiGuard({ token: undefined, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ ok: false, status: 401 });
    expect('user' in result).toBe(false);
  });

  it('F1.AC10 with an unknown session token returns 401 and no user data', () => {
    const { store, time } = setup();
    const result = apiGuard({ token: 'not-a-real-token', sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ ok: false, status: 401 });
  });

  it('F1.AC10 with a live session returns ok and the session user', () => {
    const { store, time, token } = setup();
    const result = apiGuard({ token, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ ok: true, user: { id: 1 } });
  });
});

describe('F1.AC11 ownership check returns not-found for trips the user does not own', () => {
  const tripOwnedByA = { owner_id: 1 };

  it('F1.AC11 returns ok when user A owns the trip', () => {
    expect(ownsTrip(tripOwnedByA, 1)).toBe('ok');
  });

  it('F1.AC11 returns not-found when user B asks for a trip owned by A', () => {
    expect(ownsTrip(tripOwnedByA, 2)).toBe('not-found');
  });

  it('F1.AC11 returns not-found for a missing trip, the same as another owner', () => {
    expect(ownsTrip(undefined, 2)).toBe(ownsTrip(tripOwnedByA, 2));
    expect(ownsTrip(undefined, 2)).toBe('not-found');
  });
});

describe('F1.AC23 sessions at T + 30 days are treated as ended', () => {
  it('F1.AC23 page guard redirects with the expired notice at T + 30 days', () => {
    const { store, time, token } = setup();
    time.setTime(new Date(Date.parse(START) + SESSION_LIFETIME_MS).toISOString());
    const result = pageGuard({ token, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ redirect: '/login', notice: 'expired' });
  });

  it('F1.AC23 API guard returns 401 at T + 30 days', () => {
    const { store, time, token } = setup();
    time.setTime(new Date(Date.parse(START) + SESSION_LIFETIME_MS).toISOString());
    const result = apiGuard({ token, sessions: store, clock: time.clock });
    expect(result).toStrictEqual({ ok: false, status: 401 });
  });

  it('F1.AC23 page guard still lets the page render one second before T + 30 days', () => {
    const { store, time, token } = setup();
    time.setTime(new Date(Date.parse(START) + SESSION_LIFETIME_MS - 1000).toISOString());
    expect(pageGuard({ token, sessions: store, clock: time.clock })).toStrictEqual({ ok: true });
  });
});
