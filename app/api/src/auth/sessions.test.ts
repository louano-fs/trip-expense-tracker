import { describe, expect, it } from 'vitest';
import type { NewSession, SessionRecord } from '../db/repositories/sessions.ts';
import {
  SESSION_LIFETIME_MS,
  createSession,
  endSession,
  hashSessionToken,
  resolveSession,
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

// Fake random source: each call returns the next fixed byte pattern in order.
function fakeRandom(patterns: number[]): RandomSource {
  let call = 0;
  return (size: number) => {
    const fill = patterns[call % patterns.length] ?? 0;
    call += 1;
    return new Uint8Array(size).fill(fill);
  };
}

const START = '2026-11-01T10:00:00.000Z';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe('F1.AC23 sessions expire 30 days after they are created', () => {
  it('F1.AC23 is still valid one second before T + 30 days', () => {
    const { store } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([7]),
    });
    time.setTime(new Date(Date.parse(START) + THIRTY_DAYS_MS - 1000).toISOString());
    expect(resolveSession({ token, store, clock: time.clock })).not.toBeNull();
  });

  it('F1.AC23 is null at exactly T + 30 days', () => {
    const { store } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([7]),
    });
    time.setTime(new Date(Date.parse(START) + THIRTY_DAYS_MS).toISOString());
    expect(resolveSession({ token, store, clock: time.clock })).toBeNull();
  });

  it('F1.AC23 deletes the expired record when it is resolved', () => {
    const { store, rows } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([7]),
    });
    time.setTime(new Date(Date.parse(START) + THIRTY_DAYS_MS).toISOString());
    resolveSession({ token, store, clock: time.clock });
    expect(rows.size).toBe(0);
  });

  it('F1.AC23 sets expires_at to created time plus the 30-day lifetime in UTC', () => {
    const { store, rows } = memoryStore();
    const time = fakeClock(START);
    createSession({ userId: 1, store, clock: time.clock, random: fakeRandom([7]) });
    const [row] = [...rows.values()];
    expect(row?.createdAt).toBe(START);
    expect(row?.expiresAt).toBe(new Date(Date.parse(START) + SESSION_LIFETIME_MS).toISOString());
    expect(SESSION_LIFETIME_MS).toBe(THIRTY_DAYS_MS);
  });
});

describe('F1.AC7 logout ends the session', () => {
  it('F1.AC7 resolveSession returns null after endSession', () => {
    const { store } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([7]),
    });
    expect(resolveSession({ token, store, clock: time.clock })).not.toBeNull();
    endSession({ token, store });
    expect(resolveSession({ token, store, clock: time.clock })).toBeNull();
  });
});

describe('F1.AC8 sessions in different browsers are independent', () => {
  it('F1.AC8 ending one of two sessions for the same user leaves the other valid', () => {
    const { store } = memoryStore();
    const time = fakeClock(START);
    const random = fakeRandom([1, 2]);
    const first = createSession({ userId: 5, store, clock: time.clock, random });
    const second = createSession({ userId: 5, store, clock: time.clock, random });
    expect(first).not.toBe(second);

    endSession({ token: first, store });

    expect(resolveSession({ token: first, store, clock: time.clock })).toBeNull();
    expect(resolveSession({ token: second, store, clock: time.clock })?.userId).toBe(5);
  });
});

describe('F1.R7 token handling', () => {
  it('F1.AC7 issues a 32-byte base64url token', () => {
    const { store } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([0xff]),
    });
    expect(token).toBe(Buffer.alloc(32, 0xff).toString('base64url'));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('F1.AC7 stores only the SHA-256 hash of the token, never the token', () => {
    const { store, rows } = memoryStore();
    const time = fakeClock(START);
    const token = createSession({
      userId: 1,
      store,
      clock: time.clock,
      random: fakeRandom([9]),
    });
    const [row] = [...rows.values()];
    expect(row?.idHash).toBe(hashSessionToken(token));
    expect(row?.idHash).not.toBe(token);
    expect(row?.idHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
