import { describe, expect, it } from 'vitest';
import type { ThrottleState } from '../db/repositories/throttle.ts';
import type { Clock } from './sessions.ts';
import {
  createLoginThrottle,
  recordFailure,
  recordSuccess,
  throttleDecision,
  type ThrottleStore,
} from './throttle.ts';

const EMAIL = 'sam@mail.com';
const T0 = '2026-11-24T10:00:00.000Z';

function stateWith(consecutiveFailures: number, nextAllowedAt: string | null = null): ThrottleState {
  return { email: EMAIL, consecutiveFailures, nextAllowedAt };
}

// Applies `count` failures in a row, starting at T0, and returns the state.
function failuresAt(count: number, start: string = T0): ThrottleState {
  let state = stateWith(0);
  let now = Date.parse(start);
  for (let i = 0; i < count; i += 1) {
    state = recordFailure(state, new Date(now));
    // Move the clock to the moment the next attempt is allowed, if there is a wait.
    if (state.nextAllowedAt !== null) {
      now = Date.parse(state.nextAllowedAt);
    }
  }
  return state;
}

// In-memory throttle store keyed by email, so no database is needed.
function memoryStore() {
  const rows = new Map<string, ThrottleState>();
  const store: ThrottleStore = {
    get(email: string) {
      return rows.get(email);
    },
    save(state: ThrottleState) {
      rows.set(state.email, { ...state });
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

describe('throttleDecision', () => {
  it('F1.AC19 allows an attempt before the 5th failure has any wait', () => {
    expect(throttleDecision(stateWith(4), new Date(T0))).toEqual({ allowed: true });
  });

  it('F1.AC19 refuses a 6th attempt at +29 s with a wait of 1 s', () => {
    const state = failuresAt(5);
    const at29 = new Date(Date.parse(T0) + 29_000);
    expect(throttleDecision(state, at29)).toEqual({ allowed: false, waitSeconds: 1 });
  });

  it('F1.AC19 allows the 6th attempt at +30 s', () => {
    const state = failuresAt(5);
    const at30 = new Date(Date.parse(T0) + 30_000);
    expect(throttleDecision(state, at30)).toEqual({ allowed: true });
  });

  it('F1.AC19 rounds a partial second of wait up', () => {
    const state = failuresAt(5);
    const at29_5 = new Date(Date.parse(T0) + 29_500);
    expect(throttleDecision(state, at29_5)).toEqual({ allowed: false, waitSeconds: 1 });
  });
});

describe('recordFailure', () => {
  it('F1.AC19 has no wait for the first 4 failures', () => {
    for (let count = 1; count <= 4; count += 1) {
      const state = failuresAt(count);
      expect(state.consecutiveFailures).toBe(count);
      expect(state.nextAllowedAt).toBeNull();
    }
  });

  it('F1.AC19 sets a 30 s wait at the 5th failure', () => {
    const state = failuresAt(5);
    expect(state.consecutiveFailures).toBe(5);
    expect(state.nextAllowedAt).toBe('2026-11-24T10:00:30.000Z');
  });

  it('F1.AC20 waits 30 s, 60 s, 120 s, 240 s, 480 s, 960 s, 1920 s, then caps at 3600 s', () => {
    const now = Date.parse(T0);
    const expectedWaits = [30, 60, 120, 240, 480, 960, 1920, 3600, 3600, 3600];
    let state = stateWith(4);
    for (const wait of expectedWaits) {
      state = recordFailure(state, new Date(now));
      expect(state.nextAllowedAt).toBe(new Date(now + wait * 1000).toISOString());
    }
  });

  it('F1.AC20 never produces a wait above 3600 s', () => {
    let state = stateWith(0);
    for (let i = 0; i < 200; i += 1) {
      state = recordFailure(state, new Date(T0));
      const wait = Date.parse(state.nextAllowedAt ?? T0) - Date.parse(T0);
      expect(wait).toBeLessThanOrEqual(3_600_000);
    }
  });
});

describe('recordSuccess', () => {
  it('F1.AC21 resets the count to 0 and clears the wait', () => {
    const after3 = failuresAt(3);
    expect(recordSuccess(after3)).toEqual({ email: EMAIL, consecutiveFailures: 0, nextAllowedAt: null });
  });

  it('F1.AC21 after 3 failures then a success, the next failure starts the count again at 1', () => {
    const reset = recordSuccess(failuresAt(3));
    const next = recordFailure(reset, new Date(T0));
    expect(next.consecutiveFailures).toBe(1);
    expect(next.nextAllowedAt).toBeNull();
  });
});

describe('createLoginThrottle', () => {
  it('F1.AC21 3 failures then a success leaves the stored count at 0', () => {
    const { store, rows } = memoryStore();
    const { clock } = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock });

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    expect(rows.get(EMAIL)?.consecutiveFailures).toBe(3);

    throttle.recordSuccess(EMAIL);
    expect(rows.get(EMAIL)).toEqual({ email: EMAIL, consecutiveFailures: 0, nextAllowedAt: null });
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
  });

  it('F1.AC19 refuses a 6th attempt at +29 s and allows it at +30 s, using the fake clock', () => {
    const { store } = memoryStore();
    const fake = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock: fake.clock });

    for (let i = 0; i < 5; i += 1) {
      throttle.recordFailure(EMAIL);
    }
    fake.setTime('2026-11-24T10:00:29.000Z');
    expect(throttle.check(EMAIL)).toEqual({ allowed: false, waitSeconds: 1 });

    fake.setTime('2026-11-24T10:00:30.000Z');
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
  });

  it('F1.AC19 a refused attempt does not add to the count (failures are only recorded when checked)', () => {
    const { store, rows } = memoryStore();
    const fake = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock: fake.clock });

    for (let i = 0; i < 5; i += 1) {
      throttle.recordFailure(EMAIL);
    }
    fake.setTime('2026-11-24T10:00:10.000Z');
    expect(throttle.check(EMAIL).allowed).toBe(false);
    expect(rows.get(EMAIL)?.consecutiveFailures).toBe(5);
  });

  it('F1.AC22 an unknown email gives the same decision shape and result as a known one', () => {
    const { store } = memoryStore();
    const fake = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock: fake.clock });

    // The throttle never looks up accounts, so both emails take the same path.
    // The "known" one is only a second email; no user store is involved.
    const unknownEmail = 'nobody@mail.com';
    const knownEmail = 'sam@mail.com';

    for (let i = 0; i < 5; i += 1) {
      throttle.recordFailure(unknownEmail);
      throttle.recordFailure(knownEmail);
    }

    const unknownState = store.get(unknownEmail);
    const knownState = store.get(knownEmail);
    expect(unknownState).toBeDefined();
    expect(knownState).toBeDefined();
    expect(Object.keys(unknownState ?? {}).sort()).toEqual(Object.keys(knownState ?? {}).sort());
    expect(unknownState?.consecutiveFailures).toBe(knownState?.consecutiveFailures);
    expect(unknownState?.nextAllowedAt).toBe(knownState?.nextAllowedAt);

    expect(throttle.check(unknownEmail)).toEqual(throttle.check(knownEmail));
    fake.setTime('2026-11-24T10:00:29.000Z');
    expect(throttle.check(unknownEmail)).toEqual({ allowed: false, waitSeconds: 1 });
    expect(throttle.check(knownEmail)).toEqual({ allowed: false, waitSeconds: 1 });
  });

  it('F1.AC22 an email with no stored state is treated as 0 failures and allowed', () => {
    const { store } = memoryStore();
    const { clock } = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock });

    expect(store.get('nobody@mail.com')).toBeUndefined();
    expect(throttle.check('nobody@mail.com')).toEqual({ allowed: true });
  });

  it('F1.R13 keys the throttle by the normalized email, so case and spaces share one count', () => {
    const { store, rows } = memoryStore();
    const { clock } = fakeClock(T0);
    const throttle = createLoginThrottle({ store, clock });

    throttle.recordFailure('  SAM@mail.com ');
    throttle.recordFailure('sam@MAIL.com');
    expect(rows.get('sam@mail.com')?.consecutiveFailures).toBe(2);
    expect(rows.size).toBe(1);
  });
});
