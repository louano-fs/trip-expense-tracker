import { describe, expect, it } from 'vitest';
import { EmailTakenError, type NewUser, type UserRecord } from '../../db/repositories/users.ts';
import type { NewSession, SessionRecord } from '../../db/repositories/sessions.ts';
import type { ThrottleState } from '../../db/repositories/throttle.ts';
import { buildBlocklist, STARTER_BLOCKLIST } from '../../auth/blocklist.ts';
import { login, LOGIN_MESSAGES, type LoginDeps } from '../../auth/login.ts';
import { register, type RegisterDeps } from '../../auth/register.ts';
import { apiGuard } from '../../auth/guards.ts';
import { createSession, endSession, type Clock, type SessionStore } from '../../auth/sessions.ts';
import { createLoginThrottle } from '../../auth/throttle.ts';
import { readSessionToken } from '../cookies.ts';
import {
  loginRoute,
  logoutRoute,
  registerRoute,
  type AuthRouteDeps,
  type RouteRequest,
  type RouteResponse,
} from './auth.ts';

// Fixed clock: no test reads the real time (project rules).
const NOW = new Date('2026-11-24T10:00:00.000Z');
const clock: Clock = { now: () => NOW };
const SAM_EMAIL = 'sam@mail.com';
// Not on the starter blocklist, so registration accepts it (F1.R12).
const SAM_PASSWORD = 'a quiet harbour lamp 42';

interface FakeResponse extends RouteResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  ended: boolean;
}

/** Records what a route sends. Header names are stored lowercase. */
function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code: number) {
      res.statusCode = code;
    },
    json(body: unknown) {
      res.body = body;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end() {
      res.ended = true;
    },
  };
  return res;
}

function request(body: unknown, cookie?: string): RouteRequest {
  return { body, headers: { cookie } };
}

/** In-memory session store: the fake the session rules need. */
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

/** A deterministic random source, so tokens are fixed in tests. */
const random = (size: number): Uint8Array => new Uint8Array(size).fill(7);

function registerDeps(takenEmails: string[] = []): RegisterDeps & { sessions: ReturnType<typeof memorySessionStore> } {
  const taken = new Set(takenEmails);
  let nextId = 1;
  return {
    users: {
      insert(user: NewUser) {
        if (taken.has(user.email)) {
          throw new EmailTakenError();
        }
        taken.add(user.email);
        return { id: nextId++, email: user.email };
      },
    },
    sessions: memorySessionStore(),
    hashPassword: async (password: string) => `hash:${password}`,
    blocklist: buildBlocklist(STARTER_BLOCKLIST),
    clock,
    random,
    transaction: (work) => work(),
  };
}

const SAM_RECORD: UserRecord = {
  id: 1,
  email: SAM_EMAIL,
  passwordHash: `hash:${SAM_PASSWORD}`,
  createdAt: '2026-11-01T00:00:00.000Z',
};

function loginDeps(sessions: SessionStore): LoginDeps {
  const throttleRows = new Map<string, ThrottleState>();
  return {
    users: { findByEmail: (email) => (email === SAM_EMAIL ? SAM_RECORD : undefined) },
    sessions,
    throttle: createLoginThrottle({
      store: {
        get: (email) => throttleRows.get(email),
        save: (state) => {
          throttleRows.set(state.email, state);
        },
      },
      clock,
    }),
    verifyPassword: async (stored, password) => stored === `hash:${password}`,
    clock,
    random,
    transaction: (work) => work(),
  };
}

function routeDeps(overrides: Partial<AuthRouteDeps> = {}): AuthRouteDeps {
  return {
    register: async () => {
      throw new Error('register not set up in this test');
    },
    login: async () => {
      throw new Error('login not set up in this test');
    },
    endSession: () => true,
    clock,
    cookieSecure: true,
    ...overrides,
  };
}

function setCookieOf(res: FakeResponse): string | undefined {
  return res.headers['set-cookie'];
}

describe('POST /api/register', () => {
  it('F1.AC12 register returns 201 with the user, a session cookie and no password fields', async () => {
    const deps = registerDeps();
    const res = fakeResponse();
    const route = registerRoute(routeDeps({ register: (input) => register(input, deps) }));

    await route(request({ email: SAM_EMAIL, password: SAM_PASSWORD }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ user: { id: 1, email: SAM_EMAIL } });
    expect(JSON.stringify(res.body)).not.toContain('password');
    const cookie = setCookieOf(res) ?? '';
    expect(cookie.startsWith('__Host-sid=')).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('F1.AC2 register with an email already taken returns 409 and sets no cookie', async () => {
    const deps = registerDeps([SAM_EMAIL]);
    const res = fakeResponse();
    const route = registerRoute(routeDeps({ register: (input) => register(input, deps) }));

    await route(request({ email: '  SAM@Mail.com ', password: SAM_PASSWORD }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'An account with this email already exists. Log in instead.',
      field: 'email',
    });
    expect(setCookieOf(res)).toBeUndefined();
  });

  it('F1.AC3 register with a 14-character password returns 400 for the password and sets no cookie', async () => {
    const deps = registerDeps();
    const res = fakeResponse();
    const route = registerRoute(routeDeps({ register: (input) => register(input, deps) }));

    await route(request({ email: SAM_EMAIL, password: 'fourteen chars' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Password must be at least 15 characters. A short phrase is easy to remember.',
      field: 'password',
    });
    expect(setCookieOf(res)).toBeUndefined();
  });

  it('F1.AC4 register with no body treats the email as empty and returns 400 for the email field', async () => {
    const deps = registerDeps();
    const res = fakeResponse();
    const route = registerRoute(routeDeps({ register: (input) => register(input, deps) }));

    await route(request(undefined), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Enter your email address.', field: 'email' });
  });
});

describe('POST /api/login', () => {
  it('F1.AC5 login with the right password returns 200, the user and a session cookie', async () => {
    const sessions = memorySessionStore();
    const deps = loginDeps(sessions);
    const res = fakeResponse();
    const route = loginRoute(routeDeps({ login: (input) => login(input, deps) }));

    await route(request({ email: '  SAM@mail.com', password: SAM_PASSWORD }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: { id: 1, email: SAM_EMAIL } });
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(setCookieOf(res)).toContain('__Host-sid=');
    expect(sessions.rows.size).toBe(1);
  });

  it('F1.AC6 wrong password and unknown email give identical 401 bodies and no cookie', async () => {
    const sessions = memorySessionStore();
    const deps = loginDeps(sessions);
    const route = loginRoute(routeDeps({ login: (input) => login(input, deps) }));

    const wrongPassword = fakeResponse();
    await route(request({ email: SAM_EMAIL, password: 'not the password at all' }), wrongPassword);
    const unknownEmail = fakeResponse();
    await route(request({ email: 'nobody@mail.com', password: SAM_PASSWORD }), unknownEmail);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toEqual({ error: LOGIN_MESSAGES.wrongCredentials });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(setCookieOf(wrongPassword)).toBeUndefined();
    expect(setCookieOf(unknownEmail)).toBeUndefined();
    expect(sessions.rows.size).toBe(0);
  });

  it('F1.AC19 a login during a wait returns 429 with Retry-After in seconds and the wait message', async () => {
    const sessions = memorySessionStore();
    const deps = loginDeps(sessions);
    const route = loginRoute(routeDeps({ login: (input) => login(input, deps) }));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await route(request({ email: SAM_EMAIL, password: 'wrong password here' }), fakeResponse());
    }

    const res = fakeResponse();
    await route(request({ email: SAM_EMAIL, password: SAM_PASSWORD }), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body).toEqual({ error: 'Too many failed attempts. Try again in 30 seconds.' });
    expect(setCookieOf(res)).toBeUndefined();
  });
});

describe('POST /api/logout', () => {
  it('F1.AC7 logout returns 204, ends the session and clears the cookie', () => {
    const ended: string[] = [];
    const route = logoutRoute(
      routeDeps({
        endSession: (token) => {
          ended.push(token);
          return true;
        },
      }),
    );
    const res = fakeResponse();

    route(request(undefined, '__Host-sid=token-abc'), res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(ended).toEqual(['token-abc']);
    const cookie = setCookieOf(res) ?? '';
    expect(cookie.startsWith('__Host-sid=;')).toBe(true);
    expect(cookie).toContain('Max-Age=0');
  });

  it('F1.AC7 logout with no cookie still returns 204 and ends nothing', () => {
    const ended: string[] = [];
    const route = logoutRoute(
      routeDeps({
        endSession: (token) => {
          ended.push(token);
          return true;
        },
      }),
    );
    const res = fakeResponse();

    route(request(undefined), res);

    expect(res.statusCode).toBe(204);
    expect(ended).toEqual([]);
    expect(setCookieOf(res)).toContain('Max-Age=0');
  });

  it('F1.AC7 logout really removes the session record, using the real endSession', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const route = logoutRoute(routeDeps({ endSession: (t) => endSession({ token: t, store: sessions }) }));

    route(request(undefined, `__Host-sid=${token}`), fakeResponse());

    expect(sessions.rows.size).toBe(0);
  });
});

describe('trip route guarded by apiGuard', () => {
  /** A stand-in trip endpoint. F2 adds the real ones; this one only shows the guard in front of the data. */
  function tripRoute(sessions: SessionStore) {
    return (req: RouteRequest, res: RouteResponse) => {
      const guard = apiGuard({ token: readSessionToken(req.headers.cookie), sessions, clock });
      if (!guard.ok) {
        res.status(guard.status);
        res.json({ error: 'Unauthorized' });
        return;
      }
      res.status(200);
      res.json({ trips: [{ id: 1, name: 'Lisbon' }] });
    };
  }

  it('F1.AC10 a trip route with no cookie returns 401 and no trip data', () => {
    const route = tripRoute(memorySessionStore());
    const res = fakeResponse();

    route(request(undefined), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(res.body)).not.toContain('Lisbon');
  });

  it('F1.AC10 a trip route with a live session returns its data', () => {
    const sessions = memorySessionStore();
    const token = createSession({ userId: 1, store: sessions, clock, random });
    const route = tripRoute(sessions);
    const res = fakeResponse();

    route(request(undefined, `__Host-sid=${token}`), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ trips: [{ id: 1, name: 'Lisbon' }] });
  });
});
