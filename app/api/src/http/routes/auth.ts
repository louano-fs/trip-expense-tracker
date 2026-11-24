// HTTP routes for register, log in and log out (F1.R1, F1.R5, F1.R6, F1.R7, F1.R8, F1.R10).
// Handlers are plain functions over injected services. They hold no stores and read no clock themselves.
import type { LoginInput, LoginResult } from '../../auth/login.ts';
import type { RegisterInput, RegisterResult } from '../../auth/register.ts';
import { userView } from '../../auth/responses.ts';
import { SESSION_LIFETIME_MS, type Clock } from '../../auth/sessions.ts';
import { clearSessionCookie, readSessionToken, sessionCookie } from '../cookies.ts';

/** The request fields the auth routes read. Express's Request satisfies this. */
export interface RouteRequest {
  body: unknown;
  headers: { cookie?: string | undefined };
}

/** The response methods the auth routes call. Express's Response satisfies this. */
export interface RouteResponse {
  status(code: number): void;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

/** The services the routes call. Their stores and deps are wired in index.ts. */
export interface AuthRouteDeps {
  register(input: RegisterInput): Promise<RegisterResult>;
  login(input: LoginInput): Promise<LoginResult>;
  /** Ends the session for this raw token. Other sessions are not touched (F1.R8). */
  endSession(token: string): boolean;
  clock: Clock;
  /** Session cookie `Secure` flag, from config (F1.R7). */
  cookieSecure: boolean;
}

/** Reads one credential field. A missing or non-text field is treated as empty, so the service gives its own message. */
function readField(body: unknown, field: 'email' | 'password'): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const value: unknown = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

function readCredentials(body: unknown): { email: string; password: string } {
  return { email: readField(body, 'email'), password: readField(body, 'password') };
}

/** POST /api/register: 201 with the user and a session cookie; 400 or 409 with the failing field (F1.R1, F1.R4, F1.R5). */
export function registerRoute(deps: AuthRouteDeps): (req: RouteRequest, res: RouteResponse) => Promise<void> {
  return async (req, res) => {
    const result = await deps.register(readCredentials(req.body));
    if (!result.ok) {
      res.status(result.status);
      res.json({ error: result.message, field: result.field });
      return;
    }
    const expiresAt = new Date(deps.clock.now().getTime() + SESSION_LIFETIME_MS);
    res.setHeader('Set-Cookie', sessionCookie(result.token, expiresAt, deps.cookieSecure));
    res.status(201);
    res.json({ user: userView(result.user) });
  };
}

/** POST /api/login: 200 with the user and a session cookie; 401 for a wrong login; 429 with Retry-After during a wait (F1.R6, F1.R13). */
export function loginRoute(deps: AuthRouteDeps): (req: RouteRequest, res: RouteResponse) => Promise<void> {
  return async (req, res) => {
    const result = await deps.login(readCredentials(req.body));
    if (!result.ok) {
      if (result.status === 429) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
      }
      res.status(result.status);
      res.json({ error: result.message });
      return;
    }
    const expiresAt = new Date(deps.clock.now().getTime() + SESSION_LIFETIME_MS);
    res.setHeader('Set-Cookie', sessionCookie(result.token, expiresAt, deps.cookieSecure));
    res.status(200);
    res.json({ user: result.user });
  };
}

/** POST /api/logout: ends this browser's session and always clears the cookie, with 204 (F1.R8). */
export function logoutRoute(deps: AuthRouteDeps): (req: RouteRequest, res: RouteResponse) => void {
  return (req, res) => {
    const token = readSessionToken(req.headers.cookie);
    if (token !== undefined) {
      deps.endSession(token);
    }
    res.setHeader('Set-Cookie', clearSessionCookie(deps.cookieSecure));
    res.status(204);
    res.end();
  };
}
